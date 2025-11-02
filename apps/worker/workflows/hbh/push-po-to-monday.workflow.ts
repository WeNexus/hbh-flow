import { MondayService } from '#lib/monday/monday.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';
import html from 'node-html-parser';

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
    const shipping = po.delivery_address;

    const additionalNotes = po.custom_fields
      .find((c) => c.api_name === 'cf_additional_notes')
      ?.value?.trim();

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
        values: JSON.stringify({
          text: po.delivery_customer_name,
          text27: po.reference_number,
          numbers6: ownerName,
          long_text_mkxarwqq: po.custom_fields
            .find((c) => c.api_name === 'cf_internal_notes')
            ?.value?.trim(),
          long_text_mkwpme94: additionalNotes
            ? html.parse(additionalNotes).innerText
            : undefined,
          date_mkxahyfp: po.custom_fields
            .find((c) => c.api_name === 'cf_factory_forecasted_delivery')
            ?.value?.trim(),
          address: `${shipping.attention}\n${shipping.address}${shipping.street2 ? ' ' + shipping.street2 : ''}\n${shipping.city} ${shipping.state}, ${shipping.zip}\n${shipping.country}`,
        }),
      },
    );

    for (const lineItem of po.line_items) {
      const air = lineItem.item_custom_fields
        .find((c) => c.api_name === 'cf_shipping_air')
        ?.value?.trim();
      const ocean = lineItem.item_custom_fields
        .find((c) => c.api_name === 'cf_shipping_ocean')
        ?.value?.trim();

      await client.request(
        `#graphql
        mutation($itemId: ID!, $name: String!, $values: JSON!) {
          create_subitem(
            parent_item_id: $itemId,
            item_name: $name,
            column_values: $values
          ) {
            id
          }
        }
        `,
        {
          itemId: parseInt(create_item.id, 10),
          name: lineItem.sku,
          values: JSON.stringify({
            item_name: lineItem.item_name,
            numeric_mkxarb6v: lineItem.quantity,
            numeric_mkxanp90: lineItem.rate,
            numeric_mkxa4ywb: air ? Number(air) : undefined,
            numeric_mkxac3gp: ocean ? Number(ocean) : undefined,
          }),
        },
      );
    }
  }
}
