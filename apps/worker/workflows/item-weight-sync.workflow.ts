import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({
  webhook: true,
  name: 'Push Item Weight to BigCommerce',
})
export class ItemWeightSyncWorkflow extends WorkflowBase {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private envService: EnvService,
  ) {
    super();
  }

  @Step(1)
  async run() {
    const { sku, package_details } = this.payload.item;

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db('hbh');

    const bigCommerceProduct = await db
      .collection('bigcommerce_product')
      .findOne({ sku });
    const bigCommerceVariant = await db
      .collection('bigcommerce_variant')
      .findOne({ sku });

    await client.close();

    const productId = bigCommerceVariant?.productId || bigCommerceProduct?.id;

    if (!productId) {
      return this.cancel("Product doesn't exist in BigCommerce");
    }

    const { default: convert } = await import('convert-units');

    return this.bigCommerceService.put(
      `/v3/catalog/products/${productId}${bigCommerceVariant ? `/variants/${bigCommerceVariant.id}` : ''}`,
      {
        weight: convert(package_details.weight)
          .from(package_details.weight_unit || 'lb')
          .to('lb'),
      },
      {
        connection: 'hbh',
      },
    );
  }
}
