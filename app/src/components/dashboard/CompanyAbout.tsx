import { Card, CardContent } from '@/components/ui/card';
import type { CompanyProfile } from '@/lib/pse-edge';

interface Props {
  profile: CompanyProfile | null;
}

function Fact({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      {value && href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline break-all">
          {value}
        </a>
      ) : (
        <p className="text-sm">{value ?? 'N/A'}</p>
      )}
    </div>
  );
}

export function CompanyAbout({ profile }: Props) {
  if (!profile) return null;
  if (!profile.description && !profile.sector && !profile.subsector && !profile.incorporationDate && !profile.website) {
    return null;
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4 space-y-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">About</p>
        {profile.description && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{profile.description}</p>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Sector" value={profile.sector} />
          <Fact label="Subsector" value={profile.subsector} />
          <Fact label="Incorporation Date" value={profile.incorporationDate} />
          <Fact label="Website" value={profile.website} href={profile.website ?? undefined} />
        </div>
      </CardContent>
    </Card>
  );
}
