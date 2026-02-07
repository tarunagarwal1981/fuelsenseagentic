'use client';

import * as React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const value = defaultOpen ? 'open' : 'closed';
  return (
    <Accordion type="single" collapsible defaultValue={value} className={cn(className)}>
      <AccordionItem value="section" className="border rounded-lg px-4 my-2">
        <AccordionTrigger className="text-lg font-semibold hover:no-underline">
          {title}
        </AccordionTrigger>
        {children && <AccordionContent>{children}</AccordionContent>}
      </AccordionItem>
    </Accordion>
  );
}
