export interface Buyer {
  id: number;
  uuid: string;
  name: string;
  owning_company_id: number;
  disabled: boolean;
  buyer_company_id: any;
  standard_deal_flow_id: number;
  buyer_stage_id: number;
  pricing_tier_id: number;
  slug: string;
  net_terms_id: number;
  quickbooks_customer_id: number;
  website_url: string;
  buyer_type: string;
  disable_bulk_discounts: boolean;
  vendor_disabled: boolean;
  created_at: string;
  updated_at: string;
  contacts: Contact[];
  locations: Location[];
  notes: Note[];
  stage: Stage;
  term: Term;
  pricing_tier: PricingTier;
  sales_reps: SalesRep[];
  buyer_company: any;
  tags: Tag[];
}

interface Contact {
  id: number;
  buyer_id: number;
  name: string;
  contact_preference: string;
  primary_phone: string;
  secondary_phone: any;
  title: string;
  email: string;
  memo: string;
  created_at: string;
  updated_at: string;
  notifiable: boolean;
  buyer_opted_out: boolean;
  opted_out_date: any;
  opted_out_override: any;
  opted_in_email_sent: boolean;
  opted_in_email_sent_date: any;
  last_name: any;
}

interface Location {
  id: number;
  buyer_id: number;
  name: string;
  line_one: string;
  line_two: any;
  city: string;
  state: string;
  zip: string;
  memo: string;
  state_license: string;
  state_license_doc: any;
  type: string;
  industry: any;
  state_id: number;
  country_id: number;
  coordinates_id: number;
  created_at: string;
  updated_at: string;
}

interface Note {
  id: number;
  buyer_id: number;
  buyer_location_id: number;
  buyer_contact_id: number;
  text: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Stage {
  id: number;
  sort_order: number;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

interface Term {
  id: number;
  name: string;
}

interface PricingTier {
  id: number;
  summary: any;
  type: string;
  percent: number;
  direction: string;
  exclude_from_bulk_discounts: boolean;
  dollar: any;
  version: any;
  brand_id: any;
  applies_to_packages: any;
  applies_to_cases: any;
  applies_to_singles: any;
  product_unit_measurement_id: any;
  expiration: any;
}

interface SalesRep {
  name: string;
  phone: string;
  email: string;
}

interface Tag {
  name: string;
  color: string;
  background_color: string;
}
