import React from 'react';

type Props = {
  className?: string;
  style?: React.CSSProperties;
  /** Kept for call-site compat; orange tile is used for all variants. */
  variant?: 'auto' | 'light' | 'dark';
  alt?: string;
  /** Cap shells use `./` base; web uses `/`. */
  relative?: boolean;
};

/**
 * Cap / shell brand mark — orange tile with white D + dot (same asset light/dark).
 */
export function BrandMark({ className, style, alt = 'Dhandho', relative = false }: Props) {
  const src = `${relative ? './icons/' : '/icons/'}logo-brand.png`;
  return <img src={src} alt={alt} className={className} style={style} />;
}
