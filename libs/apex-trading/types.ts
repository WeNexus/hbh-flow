export interface Links {
  first: string;
  last: string;
  prev: string;
  next: string;
}

export interface Meta {
  current_page: number;
  from: number;
  last_page: number;
  links: Link[];
  path: string;
  per_page: number;
  to: number;
  total: number;
}

export interface Link {
  url?: string;
  label: string;
  active: boolean;
}

export type PaginatedResponse<T> = {
  links: Links;
  meta: Meta;
} & T;

export interface Product {
  id: number;
  uuid: string;
  name: string;
  featured: boolean;
  list_to_buyers: boolean;
  list_to_clearinghouse: boolean;
  description: string;
  ingredients: any;
  ingredients_upload: any;
  brand_id: number;
  product_sku: string;
  dutchie_sku: string;
  product_category_id: number;
  product_cultivar_id: any;
  product_cultivar_type_id: any;
  product_type_id: number;
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
  units_per_package: any;
  units_per_case: any;
  gram_per_preroll: any;
  lineage: any;
  feminized: boolean;
  germination_rate: any;
  herm_male_rate: any;
  yields_per_acre_outdoor: any;
  per_sq_ft_indoor: any;
  curing_method: any;
  extraction_method_id: any;
  flavor_id: any;
  unit_size: number;
  sold_as: string;
  product_infusion_id: any;
  for_pets: boolean;
  archived: boolean;
  archived_at: any;
  flowering_period_id: any;
  feminized_type_id: any;
  product_packaged_unit_size_id: any;
  predominate_canabinoid_id: any;
  for_distributors: boolean;
  for_retailers: boolean;
  for_wholesalers: boolean;
  internal_notes: any;
  listing_price: string;
  listing_price_base_unit: string;
  pto_oneg_listing_price: string;
  pto_twog_listing_price: string;
  pto_eighthoz_listing_price: string;
  pto_quarteroz_listing_price: string;
  pto_halfoz_listing_price: string;
  pto_oneoz_listing_price: string;
  pto_quarterpound_listing_price: string;
  pto_halfpound_listing_price: string;
  pto_onepound_listing_price: string;
  created_at: string;
  updated_at: string;
  brand: Brand;
  category: Category;
  product_type: ProductType;
  cultivar: any;
  cultivar_type: any;
  distillate_extract_sub_type: any;
  crude_extract_sub_type: any;
  unit_measurement: UnitMeasurement;
  unit_size_unit_measurement: UnitSizeUnitMeasurement;
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
  predominate_canabinoid: any;
  images: any[];
  government_agencies: any[];
  additives: any[];
  environmental_issues: any[];
}

export interface Brand {
  id: number;
  name: string;
}

export interface Category {
  id: number;
  name: string;
  short_display_name: string;
  long_display_name: string;
}

export interface ProductType {
  id: number;
  name: string;
  product_category_id: number;
  company_id: number;
}

export interface UnitMeasurement {
  name: string;
  alias: string;
}

export interface UnitSizeUnitMeasurement {
  name: string;
  alias: string;
}

export interface Batch {
  id: number;
  uuid: string;
  name: string;
  product_id: number;
  operation_id: number;
  unlimited_quantity: boolean;
  quantity: number;
  zone_number: any;
  lot_number: any;
  sack_number: any;
  seeded: any;
  harvest_date: any;
  dry_date: any;
  extraction_date: any;
  best_by_date: any;
  test_date: any;
  production_date: any;
  thc_limit: boolean;
  hold: boolean;
  back_order: boolean;
  in_stock_expected_date: any;
  predominate_canabinoid_min_or_only: any;
  predominate_canabinoid_max: any;
  predominate_canabinoid_unit: any;
  storage_location: any;
  minimum_sales_price: string;
  minimum_sales_price_base_unit: string;
  sample_price: string;
  cost_of_goods: string;
  true_cost: string;
  listing_price: string;
  listing_price_base_unit: string;
  pto_oneg_listing_price: string;
  pto_twog_listing_price: string;
  pto_eighthoz_listing_price: string;
  pto_quarteroz_listing_price: string;
  pto_halfoz_listing_price: string;
  pto_oneoz_listing_price: string;
  pto_quarterpound_listing_price: string;
  pto_halfpound_listing_price: string;
  pto_onepound_listing_price: string;
  unit_price: UnitPrice;
  archived: boolean;
  line_note: any;
  description: any;
  allow_samples: boolean;
  track_sample_quantity: boolean;
  pull_sample_from_alternative_batch_id: number;
  sample_quantity_label: any;
  sample_size: any;
  restricted: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnitPrice {
  message: string;
}
