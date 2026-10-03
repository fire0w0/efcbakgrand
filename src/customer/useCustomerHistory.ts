import { useEffect, useState } from 'react';
import { api } from '../shared/api';
import type { CustomerDetailResponse } from '../shared/contracts';

// Order history and favorite item for the signed-in customer, from the contracted detail read.
// `signature` changes whenever the hub shows new stamps or preorder statuses, which is when
// history can change too; polling the detail route every two seconds is unnecessary.
export function useCustomerHistory(customerId: string | null, signature: string) {
  const [data, setData] = useState<CustomerDetailResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId) { setData(null); setError(''); return; }
    const controller = new AbortController();
    api<CustomerDetailResponse>(`/customers/${encodeURIComponent(customerId)}`, { signal: controller.signal })
      .then(detail => {
        if (controller.signal.aborted || detail.customer.id !== customerId) return;
        setData(detail); setError('');
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Please try again.');
      });
    return () => controller.abort();
  }, [customerId, signature]);

  return { history: data?.customer.id === customerId ? data : null, historyError: error };
}
