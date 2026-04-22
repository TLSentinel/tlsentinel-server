// ---------------------------------------------------------------------------
// Shared pagination wrapper — every list endpoint returns this shape.
// ---------------------------------------------------------------------------
export interface PaginatedList<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
}

export interface User {
  id: string
  username: string
  role: 'admin' | 'operator' | 'viewer'
  provider: 'local' | 'oidc'
  enabled: boolean
  notify: boolean
  firstName: string | null
  lastName: string | null
  email: string | null
  calendarToken: string | null
  createdAt: string
  updatedAt: string
}

export type UserList = PaginatedList<User>

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** A certificate currently linked to an endpoint, with use label and metadata. */
export interface EndpointCert {
  fingerprint: string
  /** 'tls' | 'signing' | 'encryption' | 'manual' */
  certUse: string
  isCurrent: boolean
  commonName: string
  notBefore: string
  notAfter: string
  firstSeenAt: string
  lastSeenAt: string
}

/** Returned in GET /endpoints list items. */
export interface EndpointListItem {
  id: string
  name: string
  type: string
  // host-type fields
  dnsName: string
  port: number
  // saml-type fields
  url?: string | null
  // common fields
  enabled: boolean
  scanExempt: boolean
  scannerId: string | null
  scannerName: string | null
  /** Soonest notAfter across all current certs. Null when no certs recorded yet. */
  earliestExpiry: string | null
  lastScannedAt: string | null
  lastScanError: string | null
  errorSince: string | null
  tags: TagWithCategory[]
}

/**
 * An endpoint that previously had a given cert attached, plus the date the
 * cert was last observed on that endpoint. Drives the "Historical Endpoints"
 * section on the certificate detail page.
 */
export interface HistoricalEndpointItem extends EndpointListItem {
  lastSeenAt: string
}

/** One SSO/SLO/ACS endpoint element from SAML metadata. */
export interface SAMLMetadataEndpoint {
  binding: string
  location: string
  index?: number
  isDefault?: boolean
}

/** One ContactPerson from SAML metadata. */
export interface SAMLMetadataContact {
  type: string
  givenName?: string
  surname?: string
  emailAddress?: string
  company?: string
}

/** The Organization element from SAML metadata. */
export interface SAMLMetadataOrganization {
  name?: string
  displayName?: string
  url?: string
}

/** Parsed SAML metadata bag — all fields are optional. */
export interface SAMLMetadata {
  entityId?: string
  validUntil?: string
  cacheDuration?: string
  /** "idp", "sp", or "both". */
  role?: string
  singleSignOn?: SAMLMetadataEndpoint[]
  singleLogout?: SAMLMetadataEndpoint[]
  assertionConsumer?: SAMLMetadataEndpoint[]
  nameIdFormats?: string[]
  organization?: SAMLMetadataOrganization
  contacts?: SAMLMetadataContact[]
  wantAssertionsSigned?: boolean
  authnRequestsSigned?: boolean
}

/** Returned by GET/POST/PUT /endpoints/{id} (full detail). */
export interface Endpoint {
  id: string
  name: string
  type: string
  // host-type fields
  dnsName: string
  ipAddress: string | null
  port: number
  // saml-type fields
  url?: string | null
  samlMetadata?: SAMLMetadata
  samlFetchedAt?: string
  // common fields
  enabled: boolean
  scanExempt: boolean
  scannerId: string | null
  scannerName: string | null
  activeCerts: EndpointCert[]
  lastScannedAt: string | null
  lastScanError: string | null
  errorSince: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEndpointRequest {
  name: string
  type?: string
  // host-type fields
  dnsName?: string
  ipAddress?: string
  port?: number
  // saml-type fields
  url?: string
  // common fields
  scannerId?: string
  notes?: string
}

export interface UpdateEndpointRequest {
  name: string
  type?: string
  // host-type fields
  dnsName?: string
  ipAddress?: string
  port?: number
  // saml-type fields
  url?: string
  // common fields
  enabled: boolean
  scanExempt?: boolean
  scannerId?: string
  notes?: string
}

/** PATCH /endpoints/{id} — only include the fields you want to change. */
export interface PatchEndpointRequest {
  name?: string
  // host-type fields
  dnsName?: string
  ipAddress?: string | null
  port?: number
  // saml-type fields
  url?: string | null
  // common fields
  enabled?: boolean
  scanExempt?: boolean
  scannerId?: string | null   // null clears the scanner assignment
  notes?: string | null       // null clears notes
}

export type EndpointList = PaginatedList<EndpointListItem>

export interface EndpointScanHistoryItem {
  id: string
  endpointId: string
  scannedAt: string
  fingerprint: string | null
  resolvedIp: string | null
  tlsVersion: string | null
  scanError: string | null
}

export type EndpointScanHistoryList = PaginatedList<EndpointScanHistoryItem>

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/** Returned by GET /certificates (list items). */
export interface CertificateListItem {
  fingerprint: string
  commonName: string
  sans: string[]
  notBefore: string
  notAfter: string
  issuerFingerprint: string | null
  createdAt: string
}

/** Returned by GET /certificates/{fingerprint} (full detail). */
export interface CertificateDetail {
  fingerprint: string
  commonName: string
  sans: string[]
  notBefore: string
  notAfter: string
  serialNumber: string
  subjectKeyId: string
  authorityKeyId: string | null
  issuerFingerprint: string | null
  createdAt: string
  // PEM and enriched fields populated by the server from the stored PEM
  pem: string
  subjectOrg: string
  subjectOrgUnit: string
  issuerCn: string
  issuerOrg: string
  keyAlgorithm: string
  keySize: number
  signatureAlgorithm: string
  keyUsages: string[]
  extKeyUsages: string[]
  ocspUrls: string[]
  crlDistributionPoints: string[]
  /** Root store IDs whose anchors appear anywhere in this cert's chain. */
  trustedBy: string[]
  /** True when this cert is Subject+SKI-equivalent to a CCADB root anchor. */
  isTrustAnchor: boolean
}

/** One enabled root store, used by the trust matrix card on cert detail
 *  (id + name) and the /root-stores overview page (all fields). */
export interface RootStoreSummary {
  id: string
  name: string
  kind: string
  sourceUrl: string
  anchorCount: number
  updatedAt: string | null
}

/** One trust anchor in a root store's membership list. */
export interface RootStoreAnchorItem {
  fingerprint: string
  commonName: string
  subjectOrg: string
  notAfter: string
  issuerFingerprint: string | null
}

/** Paginated response for GET /root-stores/{id}/anchors. */
export interface RootStoreAnchorList {
  items: RootStoreAnchorItem[]
  page: number
  pageSize: number
  totalCount: number
}

// ---------------------------------------------------------------------------
// Universal search — GET /search?q=...
// ---------------------------------------------------------------------------

export interface SearchEndpoint {
  id: string
  name: string
  type: string
  subtitle: string
}

export interface SearchCertificate {
  fingerprint: string
  commonName: string
  notAfter: string
}

export interface SearchScanner {
  id: string
  name: string
}

export interface SearchResults {
  endpoints: SearchEndpoint[]
  certificates: SearchCertificate[]
  scanners: SearchScanner[]
}

/** Body for POST /certificates. Exactly one field must be set. */
export interface IngestCertificateRequest {
  certificatePem?: string
  certificateDerBase64?: string
}

export type CertificateList = PaginatedList<CertificateListItem>

// ---------------------------------------------------------------------------
// Scanners — scanner tokens
// ---------------------------------------------------------------------------

/** Returned in list responses (raw token is never returned after creation). */
export interface ScannerToken {
  id: string
  name: string
  isDefault: boolean
  scanCronExpression: string
  scanConcurrency: number
  createdAt: string
  lastUsedAt: string | null
}

/** PATCH /scanners/{id} — only include the fields you want to change. */
export interface PatchScannerRequest {
  name?: string
  scanCronExpression?: string
  scanConcurrency?: number
}

/** Returned only on creation — includes the raw bearer token shown once. */
export interface ScannerTokenCreated extends ScannerToken {
  token: string
}

/** Returned on POST /scanners/{id}/regenerate-token — new token shown once. */
export interface ScannerTokenRegenerated {
  id: string
  token: string
}

// ---------------------------------------------------------------------------
// TLS profiles — returned by GET /endpoints/{id}/tls-profile
// ---------------------------------------------------------------------------

export type TLSSeverity = 'ok' | 'warning' | 'critical'

export interface TLSFinding {
  name: string
  reason: string
  severity: TLSSeverity
}

export interface TLSClassification {
  versions: TLSFinding[]
  cipherSuites: TLSFinding[]
  overallSeverity: TLSSeverity
}

// SSL Labs-style letter grade.
export type TLSGrade =
  | 'A+' | 'A' | 'A-' | 'B' | 'C' | 'D' | 'E' | 'F'
  | 'T' // Certificate not trusted.
  | 'M' // Certificate name mismatch.

export interface TLSScore {
  protocolScore: number
  // null when the scanner did not probe key-exchange strength.
  keyExchangeScore: number | null
  cipherScore: number
  score: number
  grade: TLSGrade
  warnings?: string[]
}

export interface EndpointTLSProfile {
  endpointId: string
  scannedAt: string
  ssl30: boolean
  tls10: boolean
  tls11: boolean
  tls12: boolean
  tls13: boolean
  cipherSuites: string[]
  selectedCipher: string | null
  scanError: string | null
  classification: TLSClassification
  score: TLSScore
}

// ---------------------------------------------------------------------------
// Build info — returned by GET /version
// ---------------------------------------------------------------------------
export interface BuildInfo {
  version: string
  commit: string
  buildTime: string
}

// ---------------------------------------------------------------------------
// Mail config
// ---------------------------------------------------------------------------
export interface MailConfig {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  authType: 'none' | 'plain' | 'login'
  smtpUsername: string
  passwordSet: boolean
  fromAddress: string
  fromName: string
  tlsMode: 'none' | 'starttls' | 'tls'
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
export interface Group {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface GroupList {
  items: Group[]
  page: number
  pageSize: number
  totalCount: number
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------
export interface AuditLog {
  id: string
  userId?: string
  username: string
  action: string
  resourceType?: string
  resourceId?: string
  ipAddress?: string
  createdAt: string
}

export type AuditLogList = PaginatedList<AuditLog>

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------
export interface Tag {
  id: string
  categoryId: string
  name: string
  description: string | null
  createdAt: string
}

export interface TagCategory {
  id: string
  name: string
  description: string | null
  createdAt: string
}

export interface CategoryWithTags extends TagCategory {
  tags: Tag[]
}

export interface TagWithCategory {
  id: string
  categoryId: string
  categoryName: string
  name: string
  description: string | null
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------

export interface BulkImportRow {
  name: string
  type: string
  dnsName?: string
  port?: number
  ipAddress?: string
  url?: string
  scannerId?: string
  notes?: string
}

export interface BulkImportRequest {
  rows: BulkImportRow[]
}

export interface BulkImportRowResult {
  row: number
  name: string
  id?: string
  error?: string
}

export interface BulkImportResponse {
  created: number
  failed: number
  results: BulkImportRowResult[]
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface DiscoveryNetwork {
  id: string
  name: string
  range: string
  ports: number[]
  scannerId: string | null
  scannerName: string | null
  cronExpression: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface DiscoveryNetworkList {
  items: DiscoveryNetwork[]
  totalCount: number
}

export interface CreateDiscoveryNetworkRequest {
  name: string
  range: string
  ports: number[]
  scannerId: string | null
  cronExpression: string
  enabled: boolean
}

export interface UpdateDiscoveryNetworkRequest extends CreateDiscoveryNetworkRequest {}

export interface DiscoveryInboxItem {
  id: string
  networkId: string | null
  networkName: string | null
  scannerId: string | null
  scannerName: string | null
  ip: string
  rdns: string | null
  port: number
  fingerprint: string | null
  commonName: string | null
  sans: string[]
  notAfter: string | null
  status: string
  endpointId: string | null
  endpointName: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface DiscoveryInboxList {
  items: DiscoveryInboxItem[]
  totalCount: number
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface TLSProtocolCounts {
  tls13: number
  tls12: number
  tls11: number
  tls10: number
  ssl30: number
}

export interface TLSCipherCount {
  cipher: string
  count: number
  severity: TLSSeverity
  reason?: string
}

export interface TLSIssuerCount {
  issuer: string
  count: number
}

export interface TLSAttentionItem {
  endpointId: string
  endpointName: string
  issues: string[]
  severity: TLSSeverity
}

export interface TLSPostureReport {
  totalEndpoints: number
  scannedEndpoints: number
  weakCipherEndpoints: number
  protocols: TLSProtocolCounts
  legacyEndpoints: number
  ciphers: TLSCipherCount[]
  issuers: TLSIssuerCount[]
  attention: TLSAttentionItem[]
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
export interface ResolveResponse {
  hostname: string
  addresses: string[]
}

// ---------------------------------------------------------------------------
// API Error — what the server sends back as plain text on 4xx/5xx.
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
