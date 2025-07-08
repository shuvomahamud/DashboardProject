"use client";

import React from 'react';
import { format } from 'date-fns';

interface DateTimeProps {
  value: string | Date | null | undefined;
  formatStr?: string;
  fallback?: string;
}

const DateTime: React.FC<DateTimeProps> = ({ 
  value, 
  formatStr = "MMM dd, yyyy", 
  fallback = "N/A" 
}) => {
  if (!value) {
    return <span className="text-muted">{fallback}</span>;
  }

  try {
    const date = typeof value === 'string' ? new Date(value) : value;
    return <span>{format(date, formatStr)}</span>;
  } catch (error) {
    return <span className="text-muted">{fallback}</span>;
  }
};

export default DateTime; 