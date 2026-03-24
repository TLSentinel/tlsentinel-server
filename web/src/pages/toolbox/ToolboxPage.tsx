import { FileSearch, FileCode, FilePlus, GitCompare, Link2, ArrowLeftRight } from 'lucide-react'
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
          <HubCard icon={<FileSearch className="h-4 w-4" />} title="Certificate Decoder" description="Paste a PEM certificate and inspect all fields — subject, SANs, validity, fingerprint, and more." to="/toolbox/cert-decoder" />
          <HubCard icon={<FileCode className="h-4 w-4" />} title="CSR Decoder" description="Decode a Certificate Signing Request to verify its contents before submission." to="/toolbox/csr-decoder" />
          <HubCard icon={<FilePlus className="h-4 w-4" />} title="CSR Generator" description="Generate a CSR and private key entirely in your browser. Your key is never transmitted." to="/toolbox/csr-generator" />
          <HubCard icon={<GitCompare className="h-4 w-4" />} title="Certificate Diff" description="Compare two certificates side by side — useful when verifying a renewal." to="/toolbox/cert-diff" />
          <HubCard icon={<Link2 className="h-4 w-4" />} title="Chain Builder / Validator" description="Paste a certificate bundle and verify the full chain of trust from leaf to root." to="/toolbox/cert-chain" />
          <HubCard icon={<ArrowLeftRight className="h-4 w-4" />} title="PEM / DER Converter" description="Convert certificates and keys between PEM and DER encoding." to="/toolbox/pem-der" />
        </div>
      </div>

    </div>
  )
}
