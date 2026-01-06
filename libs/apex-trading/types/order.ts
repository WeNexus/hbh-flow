import { ProductType } from '#lib/apex-trading/types/product';

export interface Order {
  id: number;
  uuid: string;
  invoice_number: string;
  subtotal: string;
  total: string;
  excise_tax: string;
  excise_tax_percentage: any;
  additional_discount: string;
  delivery_cost: string;
  cultivation_tax: string;
  cultivation_tax_percentage: number;
  order_date: string;
  created_by: string;
  operation_id: any;
  order_status_id: number;
  cancelled: boolean;
  deal_flow_id: number;
  net_terms_id: number;
  pricing_tier_id: number;
  delivery_date: any;
  due_date: any;
  estimated_departure_date: any;
  estimated_arrival_date: any;
  manifest_number: any;
  invoice_note: any;
  shipping_method: any;
  ship_name: string;
  ship_line_one: string;
  ship_line_two: any;
  ship_city: string;
  ship_state: string;
  ship_zip: string;
  ship_country: string;
  ship_from_name: string;
  ship_from_line_one: string;
  ship_from_line_two: any;
  ship_from_city: string;
  ship_from_state: string;
  ship_from_zip: string;
  ship_from_country: string;
  turnaround_time: any;
  ship_tracking_number: any;
  ship_receiving_details: any;
  total_payments: string;
  total_credits: string;
  payment_status: string;
  payments_currently_due: string;
  total_write_offs: string;
  total_trades: string;
  backorder: boolean;
  backorder_status: any;
  buyer_note: string;
  seller_company_id: number;
  buyer_id: number;
  buyer_company_id: number;
  buyer_contact_name: any;
  buyer_contact_phone: any;
  buyer_contact_email: any;
  buyer_state_license: string;
  buyer_location_id: number;
  created_at: string;
  updated_at: string;
  transporters: any[];
  buyer: Buyer;
  deal_flow: DealFlow;
  payments: any[];
  term: Term;
  pricing_tier: PricingTier;
  order_status: OrderStatus;
  notes: any[];
  sales_reps: SalesRep[];
  metrc_transfer_template: any;
  items: OrderItem[];
}

interface Buyer {
  id: number;
  name: string;
}

interface DealFlow {
  id: number;
  name: string;
  default: boolean;
  type: any;
  summary: string;
  uses_deal_flow_payments: boolean;
  created_at: string;
  updated_at: string;
  order_statuses: OrderStatus[];
}

interface ParentStatus {
  id: number;
  name: string;
}

interface Term {
  name: string;
  finalPaymentDaysAfterDelivery: number;
}

interface PricingTier {
  name: string;
  type: string;
  percent: number;
  direction: string;
  exclude_from_bulk_discounts: boolean;
  summary: any;
  expiration: any;
}

export interface OrderStatus {
  id: number;
  name: string;
  payment_percentage: number;
  archived: boolean;
  position: number;
  parent_status: ParentStatus;
}

interface SalesRep {
  name: string;
  phone: string;
  email: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  operation_id: number;
  brand_id: number;
  product_category_id: number;
  order_quantity: number;
  inventory_quantity: number;
  order_price: string;
  order_minimum_sales_price: string;
  order_sales_unit_listing_price: string;
  order_unit_measurement_id: number;
  product_type_id: number;
  product_id: number;
  batch_id: number;
  order_sample: number;
  sample_quantity_label: string;
  sample_quantity_pulled_from_inventory: number;
  sample_size: number;
  bulk_discounts_enabled: boolean;
  note: any;
  tiered_surcharge: any;
  metrc_package_label: string;
  operation_license: string;
  product_sku: any;
  description: string;
  ingredients: any;
  product_cultivar_id: any;
  product_cultivar_type_id: number;
  product_crude_extract_type_id: any;
  product_distillate_extract_sub_type_id: any;
  product_unit_measurement_id: number;
  unit_size_unit_measurement_id: number;
  state_of_material_id: any;
  product_grow_environment_id: any;
  product_grow_medium_id: any;
  product_drying_method_id: any;
  product_storage_type_id: any;
  product_container_type_id: any;
  product_trim_method_id: any;
  flowering_period_id: any;
  product_packaged_unit_size_id: any;
  feminized: any;
  feminized_type_id: any;
  units_per_package: any;
  units_per_case: any;
  gram_per_preroll: any;
  lineage: any;
  germination_rate: any;
  herm_male_rate: any;
  ingredients_upload: any;
  yields_per_acre_outdoor: any;
  per_sq_ft_indoor: any;
  curing_method: any;
  extraction_method_id: any;
  flavor_id: any;
  predominate_canabinoid_id: number;
  unit_size: number;
  product_infusion_id: any;
  for_pets: boolean;
  listing_price: string;
  listing_price_base_unit: string;
  minimum_sales_price_base_unit: string;
  minimum_sales_price: string;
  seeded: any;
  harvest_date: any;
  dry_date: any;
  extraction_date: any;
  best_by_date: any;
  production_date: any;
  test_date: any;
  thc_limit: boolean;
  back_order: boolean;
  predominate_canabinoid_min_or_only: number;
  predominate_canabinoid_max: any;
  predominate_canabinoid_unit: string;
  storage_location: any;
  cost_of_goods: any;
  true_cost: any;
  product_name: string;
  batch_name: string;
  created_at: string;
  updated_at: string;
  unit_price: UnitPrice;
  operation: Operation;
  product_category: ProductCategory;
  brand: Brand;
  product_type: ProductType;
  modifiers: Modifier[];
  distillate_extract_sub_type: any;
  crude_extract_sub_type: any;
  cultivar: any;
  cultivar_type: CultivarType;
  unit_measurement: UnitMeasurement;
  order_unit_measurement: UnitMeasurement;
  unit_size_unit_measurement: UnitMeasurement;
  state_of_material: any;
  grow_environment: any;
  grow_medium: any;
  drying_method: any;
  storage_type: any;
  container_type: any;
  trim_method: any;
  packaged_unit_size: any;
  feminized_type: any;
  flowering_period: any;
  flavor: any;
  extraction_method: any;
  infusion_method: any;
  predominate_canabinoid: PredominateCanabinoid;
  images: Image[];
  additional_cannabinoids: any[];
  terpenes: any[];
}

interface UnitPrice {
  message: string;
}

interface Operation {
  id: number;
  name: string;
  industry: string;
  state_license: string;
}

interface ProductCategory {
  id: number;
  name: string;
  short_display_name: string;
  long_display_name: string;
}

interface Brand {
  id: number;
  name: string;
}

interface Modifier {
  amount: string;
  type: string;
  bulk_discount: boolean;
  reason: string;
  created_at: string;
  updated_at: string;
}

interface CultivarType {
  id: number;
  name: string;
}

interface UnitMeasurement {
  id: number;
  name: string;
  alias: string;
}

interface PredominateCanabinoid {
  id: number;
  name: string;
  abbreviation: string;
  display_name: string;
}

interface Image {
  id: number;
  sort_order: number;
  link: string;
  created_at: string;
}
