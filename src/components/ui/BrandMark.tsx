import React from 'react';
import { cn } from '../../lib/utils';

type Props = {
  className?: string;
  style?: React.CSSProperties;
  /** Force dark-tile asset (navy bg). Default follows `html.dark`. */
  variant?: 'auto' | 'light' | 'dark';
  alt?: string;
  /** Cap shells use `./` base; web uses `/`. */
  relative?: boolean;
};

/**
 * Cap / shell brand mark with light + dark tiles.
 * Light: white bg + navy D. Dark: navy bg + white D.
 */
export function BrandMark({ className, style, variant = 'auto', alt = 'Dhandho', relative = false }: Props) {
  const base = relative ? './icons/' : '/icons/';
  const light = `${base}icon-light.png`;
  const dark = `${base}icon-dark.png`;
  if (variant === 'light') {
    return <img src={light} alt={alt} className={className} style={style} />;
  }
  if (variant === 'dark') {
    return <img src={dark} alt={alt} className={className} style={style} />;
  }
  return (
    <>
      <img src={light} alt={alt} className={cn(className, 'dark:hidden')} style={style} />
      <img src={dark} alt={alt} className={cn(className, 'hidden dark:block')} style={style} />
    </>
  );
}
