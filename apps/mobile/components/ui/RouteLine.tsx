import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export function RouteLine({ color, width = 180 }: { color: string; width?: number }) {
  return (
    <Svg width={width} height={32} viewBox="0 0 180 32" accessibilityElementsHidden>
      <Path
        d="M5 23c22-21 39 12 61-7s37 11 58-2 32-2 51-9"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="4 5"
        strokeLinecap="round"
      />
      <Circle cx="5" cy="23" r="3" fill={color} />
      <Circle cx="175" cy="5" r="3" fill={color} />
    </Svg>
  );
}
