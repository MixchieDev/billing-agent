'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Loader2 } from 'lucide-react';

interface InvoiceDetails {
  billingNo: string | null;
  customerName: string;
  amount: number;
  status: string;
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get('invoice');
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvoiceStatus() {
      if (!invoiceId) {
        setError('No invoice ID provided');
        setLoading(false);
        return;
      }

      try {
        // Poll for payment status (webhook may not have arrived yet)
        const maxAttempts = 10;
        let attempts = 0;

        const checkStatus = async (): Promise<boolean> => {
          const response = await fetch(`/api/invoices/${invoiceId}/hitpay/create-payment`);
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'COMPLETED') {
              setInvoice({
                billingNo: data.referenceNumber || invoiceId.slice(0, 8),
                customerName: 'Customer',
                amount: Number(data.amount),
                status: 'PAID',
              });
              return true;
            }
          }
          return false;
        };

        // Initial check
        const isPaid = await checkStatus();
        if (isPaid) {
          setLoading(false);
          return;
        }

        // Poll every 2 seconds
        const interval = setInterval(async () => {
          attempts++;
          const isPaid = await checkStatus();
          if (isPaid || attempts >= maxAttempts) {
            clearInterval(interval);
            setLoading(false);
            if (!isPaid) {
              // Payment might still be processing
              setInvoice({
                billingNo: invoiceId.slice(0, 8),
                customerName: 'Customer',
                amount: 0,
                status: 'PROCESSING',
              });
            }
          }
        }, 2000);

        return () => clearInterval(interval);
      } catch (err) {
        console.error('Error fetching invoice status:', err);
        setError('Failed to verify payment status');
        setLoading(false);
      }
    }

    fetchInvoiceStatus();
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-10">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            <p className="mt-4 text-gray-600">Verifying payment...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <Card className="w-full max-w-md">
          <CardContent className="py-10 text-center">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl text-green-700">
            {invoice?.status === 'PAID' ? 'Payment Successful!' : 'Payment Received'}
          </CardTitle>
          <CardDescription>
            {invoice?.status === 'PAID'
              ? 'Thank you for your payment'
              : 'Your payment is being processed'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invoice && (
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice:</span>
                  <span className="font-medium">{invoice.billingNo}</span>
                </div>
                {invoice.amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-medium">
                      PHP {invoice.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="font-medium text-green-600">
                    {invoice.status === 'PAID' ? 'Paid' : 'Processing'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <p className="text-center text-sm text-gray-500">
            A confirmation email will be sent to you shortly.
          </p>
          <p className="text-center text-sm text-gray-500">
            You may close this window.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-100">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center py-10">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
              <p className="mt-4 text-gray-600">Loading...</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <PaymentSuccessContent />
    </Suspense>
  );
}
