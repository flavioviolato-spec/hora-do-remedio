import { useEffect, useState } from 'react';

import { readProvisioningInfo, type ProvisioningInfo } from '@/lib/provisioning';

/** Lê uma vez por sessão do app — a validade não muda enquanto o app está aberto. */
export function useProvisioningInfo(): { loading: boolean; info: ProvisioningInfo | null } {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ProvisioningInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    readProvisioningInfo().then((result) => {
      if (cancelled) return;
      setInfo(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, info };
}
