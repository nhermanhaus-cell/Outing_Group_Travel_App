import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export type OutingIconName =
  | 'home'
  | 'discover'
  | 'ask'
  | 'trips'
  | 'you'
  | 'route'
  | 'vote'
  | 'spark'
  | 'bookmark'
  | 'calendar'
  | 'arrow'
  | 'close'
  | 'image'
  | 'link'
  | 'pin'
  | 'heart'
  | 'undo';

export function OutingIcon({
  name,
  color = 'currentColor',
  size = 24,
  filled = false,
}: {
  name: OutingIconName;
  color?: string;
  size?: number;
  filled?: boolean;
}) {
  const common = {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: filled ? color : 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      {name === 'home' ? <Path d="M3.5 10.5 12 3l8.5 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5a1.5 1.5 0 0 1-1.5-1.5z" {...common} /> : null}
      {name === 'discover' ? (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3z" {...common} />
        </>
      ) : null}
      {name === 'ask' ? (
        <>
          <Path d="M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" {...common} />
          <Path d="M8 11h8M12 7v8" {...common} />
        </>
      ) : null}
      {name === 'trips' ? (
        <>
          <Path d="M4 7.5h16v12H4zM8 7.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2.5M4 12h16" {...common} />
          <Path d="M10 11v2h4v-2" {...common} />
        </>
      ) : null}
      {name === 'you' ? (
        <>
          <Circle cx="12" cy="8" r="3.5" {...common} />
          <Path d="M5 21a7 7 0 0 1 14 0" {...common} />
        </>
      ) : null}
      {name === 'route' ? (
        <>
          <Circle cx="5" cy="18" r="2" {...common} />
          <Circle cx="19" cy="6" r="2" {...common} />
          <Path d="M7 18h3a2 2 0 0 0 2-2v-8a2 2 0 0 1 2-2h3" {...common} />
        </>
      ) : null}
      {name === 'vote' ? (
        <>
          <Path d="m7 3 5 5-4 4-5-5zM4 15h16v6H4z" {...common} />
          <Path d="M12 8h6l2 7" {...common} />
        </>
      ) : null}
      {name === 'spark' ? <Path d="M12 2c.5 5.8 3.2 8.5 9 9-5.8.5-8.5 3.2-9 9-.5-5.8-3.2-8.5-9-9 5.8-.5 8.5-3.2 9-9z" {...common} /> : null}
      {name === 'bookmark' ? <Path d="M6 3.5h12v17l-6-4-6 4z" {...common} /> : null}
      {name === 'calendar' ? (
        <>
          <Path d="M4 6.5h16v14H4zM4 10h16M8 3.5v5M16 3.5v5" {...common} />
          <Path d="M8 14h2M14 14h2M8 17.5h2M14 17.5h2" {...common} />
        </>
      ) : null}
      {name === 'arrow' ? <Path d="m8 4 8 8-8 8M4 12h12" {...common} /> : null}
      {name === 'close' ? <Path d="m5 5 14 14M19 5 5 19" {...common} /> : null}
      {name === 'image' ? (
        <>
          <Path d="M4 4h16v16H4zM4 17l4.5-5 3.5 3 2.5-2.5L20 18" {...common} />
          <Circle cx="15.5" cy="8.5" r="1.5" {...common} />
        </>
      ) : null}
      {name === 'link' ? <Path d="M9.5 14.5 14.5 9M7.5 16.5l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.5 7.5l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" {...common} /> : null}
      {name === 'pin' ? (
        <>
          <Path d="M12 22s7-6.1 7-13a7 7 0 1 0-14 0c0 6.9 7 13 7 13z" {...common} />
          <Circle cx="12" cy="9" r="2.2" {...common} />
        </>
      ) : null}
      {name === 'heart' ? <Path d="M12 20.5 4.7 13.7A5.2 5.2 0 0 1 12 6.4a5.2 5.2 0 0 1 7.3 7.3z" {...common} /> : null}
      {name === 'undo' ? <Path d="M9 7 4 12l5 5M5 12h7.5a6.5 6.5 0 0 1 6.5 6.5" {...common} /> : null}
    </Svg>
  );
}
