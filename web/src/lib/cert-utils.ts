import {
  X509Certificate,
  SubjectAlternativeNameExtension,
  AuthorityInfoAccessExtension,
  CRLDistributionPointsExtension,
  ExtendedKeyUsageExtension,
  KeyUsagesExtension,
  KeyUsageFlags,
  BasicConstraintsExtension,
  SubjectKeyIdentifierExtension,
  AuthorityKeyIdentifierExtension,
} from '@peculiar/x509'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface DecodedCert {
  subject: Record<string, string[]>
  issuer: Record<string, string[]>
  subjectString: string
  issuerString: string
  notBefore: Date
  notAfter: Date
  isExpired: boolean
  daysRemaining: number
  serialNumber: string
  signatureAlgorithm: string
  publicKeyInfo: string
  sha1: string
  sha256: string
  sans: Array<{ type: string; value: string }>
  keyUsages: string[]
  extendedKeyUsages: string[]
  isCA: boolean
  pathLength?: number
  subjectKeyId?: string
  authorityKeyId?: string
  ocspUrls: string[]
  caIssuerUrls: string[]
  crlUrls: string[]
  isSelfSigned: boolean
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const DN_FIELDS = ['CN', 'O', 'OU', 'C', 'ST', 'L', 'E', 'emailAddress', 'DC', 'SERIALNUMBER', 'UID']

export const DN_LABELS: Record<string, string> = {
  CN: 'Common Name',
  O: 'Organization',
  OU: 'Organizational Unit',
  C: 'Country',
  ST: 'State / Province',
  L: 'Locality',
  E: 'Email',
  'E-mail': 'Email',
  emailAddress: 'Email',
  DC: 'Domain Component',
  SERIALNUMBER: 'Serial Number',
  UID: 'User ID',
}

export const KEY_USAGE_LABELS: Record<number, string> = {
  [KeyUsageFlags.digitalSignature]: 'Digital Signature',
  [KeyUsageFlags.nonRepudiation]: 'Non-Repudiation',
  [KeyUsageFlags.keyEncipherment]: 'Key Encipherment',
  [KeyUsageFlags.dataEncipherment]: 'Data Encipherment',
  [KeyUsageFlags.keyAgreement]: 'Key Agreement',
  [KeyUsageFlags.keyCertSign]: 'Certificate Sign',
  [KeyUsageFlags.cRLSign]: 'CRL Sign',
  [KeyUsageFlags.encipherOnly]: 'Encipher Only',
  [KeyUsageFlags.decipherOnly]: 'Decipher Only',
}

export const EKU_LABELS: Record<string, string> = {
  '1.3.6.1.5.5.7.3.1': 'Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'Email Protection',
  '1.3.6.1.5.5.7.3.8': 'Timestamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function bufToHex(buf: ArrayBuffer, sep = ':') {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(sep)
    .toUpperCase()
}

export function fmtDate(d: Date) {
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function ekuLabel(oid: string) {
  return EKU_LABELS[oid] ?? oid
}

export function keyUsageList(flags: number): string[] {
  return Object.entries(KEY_USAGE_LABELS)
    .filter(([bit]) => flags & Number(bit))
    .map(([, label]) => label)
}

export function pubKeyDescription(algo: Algorithm): string {
  const name = algo.name
  if (name.includes('RSA')) {
    const rsa = algo as RsaHashedKeyAlgorithm
    const bits = rsa.modulusLength ? ` ${rsa.modulusLength}-bit` : ''
    const hash = rsa.hash?.name ? ` / ${rsa.hash.name}` : ''
    return `${name}${bits}${hash}`
  }
  if (name === 'ECDSA' || name === 'ECDH' || name === 'EC') {
    const ec = algo as EcKeyAlgorithm
    return ec.namedCurve ? `${name} (${ec.namedCurve})` : name
  }
  return name
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export async function decodeCert(pem: string): Promise<DecodedCert> {
  const cert = new X509Certificate(pem.trim())

  const [sha1Buf, sha256Buf] = await Promise.all([
    cert.getThumbprint(),
    cert.getThumbprint({ name: 'SHA-256' }),
  ])

  const now = new Date()
  const msRemaining = cert.notAfter.getTime() - now.getTime()
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))

  function extractDN(name: typeof cert.subjectName) {
    const result: Record<string, string[]> = {}
    for (const field of DN_FIELDS) {
      const vals = name.getField(field)
      if (vals.length) result[field] = vals
    }
    return result
  }

  const sanExt = cert.getExtension(SubjectAlternativeNameExtension)
  const sans = sanExt
    ? sanExt.names.items.map((n) => ({ type: n.type, value: n.value }))
    : []

  const kuExt = cert.getExtension(KeyUsagesExtension)
  const ekuExt = cert.getExtension(ExtendedKeyUsageExtension)
  const bcExt = cert.getExtension(BasicConstraintsExtension)
  const skiExt = cert.getExtension(SubjectKeyIdentifierExtension)
  const akiExt = cert.getExtension(AuthorityKeyIdentifierExtension)
  const aiaExt = cert.getExtension(AuthorityInfoAccessExtension)
  const crlExt = cert.getExtension(CRLDistributionPointsExtension)

  const ocspUrls = aiaExt ? aiaExt.ocsp.map((g) => g.value) : []
  const caIssuerUrls = aiaExt ? aiaExt.caIssuers.map((g) => g.value) : []

  const crlUrls: string[] = []
  if (crlExt) {
    for (const dp of crlExt.distributionPoints) {
      for (const gn of dp.distributionPoint?.fullName ?? []) {
        if (gn.uniformResourceIdentifier) crlUrls.push(gn.uniformResourceIdentifier)
      }
    }
  }

  return {
    subject: extractDN(cert.subjectName),
    issuer: extractDN(cert.issuerName),
    subjectString: cert.subject,
    issuerString: cert.issuer,
    notBefore: cert.notBefore,
    notAfter: cert.notAfter,
    isExpired: msRemaining < 0,
    daysRemaining,
    serialNumber: cert.serialNumber.match(/.{1,2}/g)?.join(':').toUpperCase() ?? cert.serialNumber,
    signatureAlgorithm: cert.signatureAlgorithm.name,
    publicKeyInfo: pubKeyDescription(cert.publicKey.algorithm),
    sha1: bufToHex(sha1Buf),
    sha256: bufToHex(sha256Buf),
    sans,
    keyUsages: kuExt ? keyUsageList(kuExt.usages) : [],
    extendedKeyUsages: ekuExt ? ekuExt.usages.map((u) => ekuLabel(String(u))) : [],
    isCA: bcExt?.ca ?? false,
    pathLength: bcExt?.pathLength,
    subjectKeyId: skiExt?.keyId,
    authorityKeyId: akiExt?.keyId,
    ocspUrls,
    caIssuerUrls,
    crlUrls,
    isSelfSigned: cert.subject === cert.issuer,
  }
}
