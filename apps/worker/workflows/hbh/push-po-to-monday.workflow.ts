import { MondayService } from '#lib/monday/monday.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import axios, { toFormData } from 'axios';
import { Logger } from '@nestjs/common';
import html from 'node-html-parser';
import { chunk } from 'lodash-es';

@Workflow({
  name: 'HBH - Push PO to Monday',
  concurrency: 1,
  webhook: true,
})
export class PushPoToMondayWorkflow extends WorkflowBase {
  constructor(
    private readonly mondayService: MondayService,
    private readonly zohoService: ZohoService,
  ) {
    super();
  }

  private logger = new Logger(PushPoToMondayWorkflow.name);

  @Step(1)
  async execute() {
    const client = await this.mondayService.getClient('hbh');

    const po = this.payload.purchaseorder;
    const shipping =
      typeof po.delivery_address === 'string'
        ? JSON.parse(po.delivery_address)
        : po.delivery_address;
    const customFields =
      typeof po.custom_fields === 'string'
        ? JSON.parse(po.custom_fields)
        : po.custom_fields;
    const lineItems =
      typeof po.line_items === 'string'
        ? JSON.parse(po.line_items)
        : po.line_items;

    const additionalNotes = customFields
      .find((c) => c.api_name === 'cf_additional_notes')
      ?.value?.trim();
    const mondayLink = customFields.find(
      (c) => c.api_name === 'cf_monday_link',
    );

    let ownerName: string | undefined = undefined;

    try {
      const { data: res } = await this.zohoService.get(
        `/inventory/v1/contacts/${po.delivery_customer_id}`,
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
          },
        },
      );

      if (res.contact?.crm_owner_id) {
        const { data: usersRes } = await this.zohoService.get(
          `/crm/v8/users/${res.contact.crm_owner_id}`,
          {
            connection: 'hbh',
            params: {
              type: 'AllUsers',
            },
          },
        );

        ownerName = usersRes.users[0]?.full_name;
      }
    } catch (e) {
      this.logger.warn(
        `Failed to fetch CRM owner for contact ${po.delivery_customer_id}: ${e.message}`,
      );
    }

    const { boards } = await client.request(
      `#graphql
      query ($po: CompareValue!) {
        boards(ids:18325813609) {
          items_page(query_params: {rules: [{compare_value: $po, column_id: "name", operator: starts_with}]}, limit: 1) {
            items {
              id
              subitems {
                id
              }
            }
          }
        }
      }
      `,
      {
        po: po.purchaseorder_number,
      },
    );

    const existingItem = boards[0].items_page.items[0];
    let itemId: string | undefined = existingItem?.id;

    const itemColumnValues = JSON.stringify({
      text: po.delivery_customer_name,
      numbers6: ownerName,
      link_mkxbv58a: {
        url: `https://inventory.zoho.com/app/776003162#/purchaseorders/${po.purchaseorder_id}`,
        text: po.reference_number,
      },
      long_text_mkxarwqq: customFields
        .find((c) => c.api_name === 'cf_internal_notes')
        ?.value?.trim(),
      long_text_mkwpme94: additionalNotes
        ? html.parse(additionalNotes).innerText
        : undefined,
      date_mkxahyfp: customFields
        .find((c) => c.api_name === 'cf_factory_forecasted_delivery')
        ?.value?.trim(),
      address: `${shipping.attention}\n${shipping.address}${shipping.street2 ? ' ' + shipping.street2 : ''}\n${shipping.city} ${shipping.state}, ${shipping.zip}\n${shipping.country}`,
    });

    if (!itemId) {
      const { create_item } = await client.request(
        `#graphql
      mutation($values: JSON!, $name: String!) {
        create_item(
          board_id: "18325813609"
          group_id: "new_group98224"
          item_name: $name
          column_values: $values
        ) {
          id
        }
      }
    `,
        {
          name: po.purchaseorder_number,
          values: itemColumnValues,
        },
      );

      itemId = create_item.id;
    } else {
      // Update existing item if needed
      const { change_multiple_column_values } = await client.request(
        `#graphql
      mutation($id: ID!, $values: JSON!) {
        change_multiple_column_values(
          item_id: $id,
          board_id: 18325813609,
          column_values: $values
        ) {
          id
        }
      }
    `,
        {
          id: itemId,
          values: itemColumnValues,
        },
      );

      itemId = change_multiple_column_values.id;

      // Delete existing subitems
      const chunks = chunk(
        existingItem.subitems.map((s) => s.id),
        25,
      );

      await Promise.all(
        chunks.map((chunk) => {
          const mutations = chunk
            .map((c, i) => `s${i}: delete_item (item_id: ${c}) {id}`)
            .join('\n');

          return client.request(
            `#graphql
        mutation {
          ${mutations}
        }
        `,
          );
        }),
      );

      // Clear file column before re-uploading
      await client.request(
        `#graphql
        mutation($itemId: ID!) {
          change_column_value(
            board_id: 18325813609,
            item_id: $itemId,
            column_id: "file_mkxb1h1a",
            value: "{\\"clear_all\\": true}"
          ) {
            id
          }
        }
        `,
        {
          itemId,
        },
      );
    }

    if (!mondayLink?.value?.trim()) {
      await this.zohoService.put(
        `/inventory/v1/purchaseorders/${po.purchaseorder_id}`,
        {
          custom_fields: [
            {
              value: `https://honeybee-herb.monday.com/boards/18325813609/pulses/${itemId}`,
              customfield_id: '3195387000190103952',
            },
          ],
        },
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
          },
        },
      );
    }

    const chunks = chunk(lineItems, 20);

    await Promise.all(
      chunks.map(async (chunk) => {
        const mutations = chunk
          .map((lineItem, i) => {
            const air = lineItem.item_custom_fields
              .find((c) => c.api_name === 'cf_shipping_air')
              ?.value?.trim();
            const ocean = lineItem.item_custom_fields
              .find((c) => c.api_name === 'cf_shipping_ocean')
              ?.value?.trim();

            return `s${i}: create_subitem(
            parent_item_id: ${itemId},
            item_name: "${lineItem.sku}",
            column_values: "${JSON.stringify({
              item_name: lineItem.item_name,
              numeric_mkxarb6v: lineItem.quantity,
              numeric_mkxanp90: lineItem.rate,
              numeric_mkxa4ywb: air ? Number(air) : undefined,
              numeric_mkxac3gp: ocean ? Number(ocean) : undefined,
            }).replace(/"/g, '\\"')}"
          ) { id }`;
          })
          .join('\n');

        await client.request(
          `#graphql
        mutation {
          ${mutations}
        }
        `,
        );
      }),
    );

    // Upload PDF to file column

    const formData = toFormData({
      query: `#graphql
      mutation($id: ID!, $file: File!) {
        add_file_to_column(
          item_id: $id
          column_id: "file_mkxb1h1a"
          file: $file
        ) {
          id
        }
      }
      `,
      variables: {
        id: itemId,
      },
    });

    const token = await this.mondayService.getToken('hbh');

    const pdfStream = await this.zohoService.get(
      `/inventory/v1/purchaseorders/${po.purchaseorder_id}`,
      {
        connection: 'hbh',
        params: {
          accept: 'pdf',
          organization_id: '776003162',
        },
        responseType: 'stream',
      },
    );

    formData.append('variables[file]', pdfStream.data, {
      filename: `${po.purchaseorder_number}.pdf`,
      contentType: 'application/pdf',
    });

    await axios.postForm(`https://api.monday.com/v2/file`, formData, {
      headers: {
        Authorization: token.access,
      },
    });
  }
}
