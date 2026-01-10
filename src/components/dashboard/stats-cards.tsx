'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Clock, CheckCircle, XCircle, Mail, TrendingUp } from 'lucide-react';

interface StatsCardsProps {
  stats: {
    pending: number;
    approved: number;
    rejected: number;
    sent: number;
    totalPendingAmount: number;
    totalApprovedAmount: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      title: 'Pending Approval',
      value: stats.pending,
      subvalue: formatCurrency(stats.totalPendingAmount),
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'Approved',
      value: stats.approved,
      subvalue: formatCurrency(stats.totalApprovedAmount),
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Rejected',
      value: stats.rejected,
      subvalue: 'Needs review',
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Sent to Clients',
      value: stats.sent,
      subvalue: 'This month',
      icon: Mail,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              {card.title}
            </CardTitle>
            <div className={`rounded-full p-2 ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-gray-500">{card.subvalue}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
