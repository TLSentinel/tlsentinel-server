import { FileSearch, FileCode, FilePlus, GitCompare, Wifi, List, ArrowLeftRight, Binary, Key, Shuffle } from 'lucide-react'
import { HubCard } from '@/components/ui/hub-card'

export default function ToolboxPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Toolbox</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          PKI and TLS utilities — no external sites, no data leaves your browser.
        </p>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Certificates &amp; PKI</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-3xl">
          <HubCard icon={<FileSearch className="h-4 w-4" />} title="Certificate Decoder" description="Paste a PEM certificate and inspect all fields — subject, SANs, validity, fingerprint, and more." soon />
          <HubCard icon={<FileCode className="h-4 w-4" />} title="CSR Decoder" description="Decode a Certificate Signing Request to verify its contents before submission." soon />
          <HubCard icon={<FilePlus className="h-4 w-4" />} title="CSR Generator" description="Generate a CSR and private key entirely in your browser. Your key is never transmitted." soon />
          <HubCard icon={<GitCompare className="h-4 w-4" />} title="Certificate Diff" description="Compare two certificates side by side — useful when verifying a renewal." soon />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">TLS Testing</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-3xl">
          <HubCard icon={<Wifi className="h-4 w-4" />} title="TLS Handshake Tester" description="Test a host and port on demand without waiting for a scheduled scanner run." soon />
          <HubCard icon={<List className="h-4 w-4" />} title="Cipher Suite Reference" description="Searchable cipher suite list with weak and deprecated status." soon />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Encoding &amp; Conversion</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-3xl">
          <HubCard icon={<ArrowLeftRight className="h-4 w-4" />} title="PEM / DER Converter" description="Convert certificates and keys between PEM and DER encoding." soon />
          <HubCard icon={<Binary className="h-4 w-4" />} title="Base64" description="Encode or decode Base64 — standard and URL-safe variants." soon />
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Keys &amp; Secrets</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-3xl">
          <HubCard icon={<Key className="h-4 w-4" />} title="Key Generator" description="Generate RSA or ECDSA keypairs in your browser. Private keys are never transmitted." soon />
          <HubCard icon={<Shuffle className="h-4 w-4" />} title="Secret Generator" description="Generate random secrets in hex, Base64, or alphanumeric — configurable length." soon />
        </div>
      </div>
    </div>
  )
}
