/* eslint-disable react/only-export-components */
import React from 'react';

export function buttonStyles({ variant = 'primary', size = 'md', block = false, className = '' } = {}) {
  const variantClass = {
    primary: 'care-button-primary',
    secondary: 'care-button-secondary',
    ghost: 'care-button-ghost',
    danger: 'care-button-danger'
  }[variant] || 'care-button-primary';
  const sizeClass = size === 'sm' ? 'care-button-sm' : size === 'lg' ? 'care-button-lg' : '';
  return `${variantClass} ${sizeClass} ${block ? 'w-full' : ''} ${className}`.trim();
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button type={type} className={buttonStyles({ variant, size, block, className })} {...props}>
      {children}
    </button>
  );
}
