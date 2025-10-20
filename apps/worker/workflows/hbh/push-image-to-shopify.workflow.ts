import { ShopifyService } from '#lib/shopify/shopify.service';
import { MondayService } from '#lib/monday/monday.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';

@Workflow({
  name: 'HBH - Push Item Image to Shopify',
  webhook: true,
})
export class HBHPushImageToShopifyWorkflow extends WorkflowBase<Payload> {
  constructor(
    private readonly shopifyService: ShopifyService,
    private readonly mondayService: MondayService,
  ) {
    super();
  }

  private logger = new Logger();

  @Step(1)
  async validate() {
    const body = this.payload;

    if (!body.token || !body.boardId) {
      return this.cancel('Missing token or boardId');
    }

    try {
      await this.mondayService.validateSession(body.token);
    } catch {
      return this.cancel('Unauthorized');
    }
  }

  @Step(2)
  async process() {
    const client = await this.mondayService.getClient('hbh');
    const { boardId, groupId, itemIds } = this.payload;
    const itemIdChunks = chunk(itemIds, 100);
    let cursor: string | number | null = groupId ? null : 0;

    do {
      let variables: Record<string, any>;
      let query: string;

      if (groupId) {
        query = `#graphql
        query ($boardId: [ID!], $groupId: [String], $cursor: String) {
          boards(ids: $boardId){
            groups(ids: $groupId) {
              items_page(limit: 500, cursor: $cursor) {
                cursor
                items {
                  id
                  assets {
                    url
                    public_url
                  }
                  column_values {
                    column {
                      title
                    }
                    text
                  }
                }
              }
            }
          }
        }
        `;
        variables = { boardId, groupId, cursor };
      } else {
        query = `#graphql
        query ($ids: [ID!]) {
          items(ids: $ids) {
            id
            assets {
              url
              public_url
            }
            column_values {
              column {
                title
              }
              text
            }
          }
        }
        `;
        variables = { ids: itemIdChunks[cursor as number] };
      }

      const mondayRes = await client.request<GroupResult | ItemsResult>(
        query,
        variables,
      );

      const items = groupId
        ? (mondayRes as GroupResult).boards[0].groups[0].items_page.items
        : (mondayRes as ItemsResult).items;
      cursor = groupId
        ? (mondayRes as GroupResult).boards[0].groups[0].items_page.cursor
        : (cursor as number) + 1 >= itemIdChunks.length
          ? null
          : (cursor as number) + 1;

      await this.pushProductMedia(items);

      if (this.payload.setOK) {
        await this.updateMondayStatus(items, 'OK');
      }
    } while (cursor !== null);
  }

  async updateMondayStatus(items: Item[], status: string) {
    const client = await this.mondayService.getClient('hbh');
    const { boardId } = this.payload;

    const chunks = chunk(items, 100);

    for (const items of chunks) {
      const mutations = items.map((item, index) => {
        const statusColumn = item.column_values.find(
          (cv) => cv.column.title === 'Status',
        );

        if (!statusColumn || statusColumn.text === status) {
          return null;
        }

        return `i${index}: change_simple_column_value(item_id: ${item.id}, board_id: ${boardId}, column_id: "status", value: "${status}") { id }`;
      });

      const mutationString = mutations.filter((m) => m !== null).join('\n');

      if (mutationString) {
        const mutation = `#graphql
      mutation {
        ${mutationString}
      }
      `;

        await client.request(mutation);
      }
    }
  }

  async pushProductMedia(items: Item[]) {
    for (const item of items) {
      const productId = item.column_values.find(
        (cv) => cv.column.title === 'Product ID',
      )?.text;

      const imagesStr = item.column_values.find(
        (cv) => cv.column.title === 'Images',
      )?.text;

      if (!productId || !imagesStr) {
        this.logger.warn(`Missing productId or images for item ${item.id}`);
        continue;
      }

      const images = imagesStr
        .split(',')
        .map(
          (url) =>
            item.assets.find((a) => a.url.trim() === url.trim())!.public_url,
        )
        .filter(Boolean);

      try {
        await this.shopifyService.gql({
          connection: 'hbh_retail',
          root: 'productUpdate',
          query: `#graphql
          mutation ($id: ID!, $media: [CreateMediaInput!]) {
            productUpdate(media: $media, product: { id: $id }) {
              userErrors {
                field
                message
              }
            }
          }
          `,
          variables: {
            id: `gid://shopify/Product/${productId}`,
            media: images.map((url) => ({
              mediaContentType: 'IMAGE',
              originalSource: url,
              alt: `Image for product ${productId}`,
            })),
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (e) {
        this.logger.error(
          `Failed to push images for product ${productId}: ${e}`,
        );
      }
    }
  }
}

interface Payload {
  token: string;
  boardId: number;
  groupId: string | null;
  itemIds: number[];
  setOK: boolean;
}

interface Item {
  id: string;
  column_values: {
    column: { title: string };
    text: string;
  }[];
  assets: {
    url: string;
    public_url: string;
  }[];
}

interface GroupResult {
  boards: {
    groups: {
      items_page: {
        cursor: string | null;
        items: Item[];
      };
    }[];
  }[];
}

interface ItemsResult {
  items: Item[];
}
