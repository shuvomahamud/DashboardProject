"use client";

import React from 'react';
import { Badge } from 'react-bootstrap';

interface BooleanBadgeProps {
  value: boolean | null | undefined;
  trueLabel?: string;
  falseLabel?: string;
  nullLabel?: string;
}

const BooleanBadge: React.FC<BooleanBadgeProps> = ({ 
  value, 
  trueLabel = "Yes", 
  falseLabel = "No", 
  nullLabel = "N/A" 
}) => {
  if (value === null || value === undefined) {
    return <Badge bg="secondary">{nullLabel}</Badge>;
  }
  
  return (
    <Badge bg={value ? "success" : "danger"}>
      {value ? trueLabel : falseLabel}
    </Badge>
  );
};

export default BooleanBadge; 