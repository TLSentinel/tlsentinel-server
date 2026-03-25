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
  role: 'admin' | 'viewer'
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

/** Returned in GET /endpoints list items (no ipAddress, createdAt, updatedAt). */
export interface EndpointListItem {
  id: string
  name: string
  dnsName: string
  port: number
  enabled: boolean
  scannerId: string | null
  scannerName: string | null
  activeFingerprint: string | null
  lastScannedAt: string | null
  lastScanError: string | null
  errorSince: string | null
}

/** Returned by GET/POST/PUT /endpoints/{id} (full detail). */
export interface Endpoint {
  id: string
  name: string
  dnsName: string
  ipAddress: string | null
  port: number
  enabled: boolean
  scannerId: string | null
  scannerName: string | null
  activeFingerprint: string | null
  lastScannedAt: string | null
  lastScanError: string | null
  errorSince: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateEndpointRequest {
  name: string
  dnsName: string
  ipAddress?: string
  port?: number
  scannerId?: string
  notes?: string
}

export interface UpdateEndpointRequest {
  name: string
  dnsName: string
  ipAddress?: string
  port: number
  enabled: boolean
  scannerId?: string
  notes?: string
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

export interface EndpointScanHistoryList {
  items: EndpointScanHistoryItem[]
}

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
  scanIntervalSeconds: number
  scanConcurrency: number
  createdAt: string
  lastUsedAt: string | null
}

/** Returned only on creation — includes the raw bearer token shown once. */
export interface ScannerTokenCreated extends ScannerToken {
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

export interface EndpointTLSProfile {
  endpointId: string
  scannedAt: string
  tls10: boolean
  tls11: boolean
  tls12: boolean
  tls13: boolean
  cipherSuites: string[]
  selectedCipher: string | null
  scanError: string | null
  classification: TLSClassification
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
