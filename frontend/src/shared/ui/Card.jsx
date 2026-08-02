import React from 'react';

export default function Card({
  as: Component = 'div',
  children,
  className = '',
  hoverable = false,
  padding = 'md',
  ...props
}) {
  const paddingClass = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6'
  }[padding] || 'p-5';

  return (
    <Component
      className={`care-card ${hoverable ? 'care-card-hover' : ''} ${paddingClass} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
