export type RoleName =
  | 'Owner'
  | 'Admin'
  | 'CatalogManager'
  | 'Contributor'
  | 'Viewer';

export const ROLE_HIERARCHY: Record<RoleName, number> = {
  Owner: 100,
  Admin: 80,
  CatalogManager: 60,
  Contributor: 40,
  Viewer: 20,
};

export type UseCase =
  | 'Retail'
  | 'B2B_Manufacturing'
  | 'Fashion'
  | 'Food_Beverage'
  | 'Other';

export type SkuBand = 'lt_1k' | '1k_10k' | '10k_100k' | '100k_plus';

export type AttributeType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'price'
  | 'media'
  | 'metric';

export type ImportJobStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'partial'
  | 'failed';

export type SupplierSubmissionStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type SyndicationAction = 'create' | 'update' | 'delete';
export type SyndicationStatus = 'success' | 'failed' | 'pending';

export type ConnectorType =
  | 'shopify'
  | 'bigcommerce'
  | 'amazon'
  | 'walmart'
  | 'generic_api'
  | 'print';

export type PlanTier = 'Starter' | 'Growth' | 'Enterprise';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId?: string;
  workspaceId?: string;
  role?: RoleName;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/** Frozen Unilog Expected Output Delivery Format (252 columns). */
export type DeliveryFormatRow = Record<string, string>;

export const DELIVERY_FORMAT_HEADER_COUNT = 252;
