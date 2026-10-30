import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

export type IconName =
  | 'home'
  | 'schedule'
  | 'friends'
  | 'profile'
  | 'play'
  | 'plus'
  | 'check'
  | 'bell'
  | 'close'
  | 'back'
  | 'heart'
  | 'chat'
  | 'chat-off'
  | 'share'
  | 'gift'
  | 'send'
  | 'lock'
  | 'eye'
  | 'camera'
  | 'more'
  | 'replay'
  | 'pause'
  | 'back10'
  | 'forward10'
  | 'next'
  | 'chevron'
  | 'turn'
  | 'live'
  | 'reel'
  | 'search'
  | 'settings'
  | 'ticket'
  | 'mic'
  | 'ghost'
  | 'dollar'
  | 'image'
  | 'vault'
  | 'link'
  | 'megaphone';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
}

/** Stroke icons drawn to match the mock-up. Decorative: callers label the button. */
export function Icon({ name, size = 22, color = colors.text, filled = false }: Props) {
  const common = {
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const fill = filled ? color : 'none';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'home' && <Path {...common} d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />}
      {name === 'schedule' && (
        <>
          <Rect {...common} x={3} y={5} width={18} height={16} rx={2} />
          <Path {...common} d="M3 10h18M8 3v4M16 3v4" />
        </>
      )}
      {name === 'friends' && (
        <>
          <Circle {...common} cx={9} cy={8} r={3.5} />
          <Path
            {...common}
            d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.7 3 2.5 3.5 5.2"
          />
        </>
      )}
      {name === 'profile' && (
        <>
          <Circle {...common} cx={12} cy={8} r={4} />
          <Path {...common} d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </>
      )}
      {name === 'mic' && (
        <>
          <Rect {...common} x={9} y={3} width={6} height={11} rx={3} />
          <Path {...common} d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </>
      )}
      {name === 'ghost' && (
        <>
          <Path {...common} fill={fill} d="M5 21V11a7 7 0 0 1 14 0v10l-2.5-2-2.3 2-2.2-2-2.2 2-2.3-2z" />
          <Circle cx={9.5} cy={11} r={1.2} fill={filled ? colors.ink : color} />
          <Circle cx={14.5} cy={11} r={1.2} fill={filled ? colors.ink : color} />
        </>
      )}
      {name === 'dollar' && (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M15 9.5c-.5-1.2-1.7-2-3-2-1.7 0-3 1-3 2.3 0 3 6 1.7 6 4.6 0 1.4-1.3 2.4-3 2.4-1.4 0-2.6-.8-3.1-2M12 6v1.5M12 16.8v1.4" />
        </>
      )}
      {name === 'image' && (
        <>
          <Rect {...common} x={3} y={4} width={18} height={16} rx={3} />
          <Circle {...common} cx={9} cy={10} r={1.8} />
          <Path {...common} d="M21 16l-5-5-9 9" />
        </>
      )}
      {name === 'vault' && (
        <>
          <Rect {...common} x={3} y={4} width={18} height={15} rx={2.5} />
          <Circle {...common} cx={12} cy={11.5} r={3.5} />
          <Path {...common} d="M12 8v1M12 14v1M7 19v2M17 19v2" />
        </>
      )}
      {name === 'link' && <Path {...common} d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />}
      {name === 'megaphone' && <Path {...common} d="M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 0 1 0 6M7 14l1.5 5h2.5l-1-4.5" />}
      {name === 'play' && <Path {...common} fill={color} d="M7 4.5v15l12-7.5z" />}
      {name === 'plus' && <Path {...common} strokeWidth={2.4} d="M12 5v14M5 12h14" />}
      {name === 'check' && <Path {...common} strokeWidth={2.4} d="M5 12.5l4.5 4.5L19 7.5" />}
      {name === 'bell' && (
        <>
          <Path {...common} fill={fill} d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
          <Path {...common} d="M10 20a2 2 0 0 0 4 0" />
        </>
      )}
      {name === 'close' && <Path {...common} strokeWidth={2.2} d="M6 6l12 12M18 6L6 18" />}
      {name === 'back' && <Path {...common} strokeWidth={2.2} d="M15 5l-7 7 7 7" />}
      {name === 'heart' && (
        <Path
          {...common}
          fill={fill}
          d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"
        />
      )}
      {(name === 'chat' || name === 'chat-off') && (
        <>
          <Path {...common} d="M4 5h16v11H9l-5 4z" />
          {name === 'chat-off' && <Path {...common} d="M3 3l18 18" />}
        </>
      )}
      {name === 'share' && (
        <Path {...common} d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      )}
      {name === 'gift' && (
        <>
          <Rect {...common} x={3} y={9} width={18} height={12} rx={1.5} />
          <Path
            {...common}
            d="M12 9v12M3 13h18M12 9c-2-4-6-4-6-1.5S10 9 12 9zM12 9c2-4 6-4 6-1.5S14 9 12 9z"
          />
        </>
      )}
      {name === 'send' && <Path {...common} strokeWidth={2.4} d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'lock' && (
        <>
          <Rect {...common} x={5} y={11} width={14} height={10} rx={2} />
          <Path {...common} d="M8 11V8a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === 'eye' && (
        <>
          <Path {...common} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <Circle {...common} cx={12} cy={12} r={3} />
        </>
      )}
      {name === 'camera' && (
        <>
          <Path {...common} d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <Circle {...common} cx={12} cy={13} r={3.5} />
        </>
      )}
      {name === 'more' && (
        <>
          <Circle cx={5} cy={12} r={1.8} fill={color} />
          <Circle cx={12} cy={12} r={1.8} fill={color} />
          <Circle cx={19} cy={12} r={1.8} fill={color} />
        </>
      )}
      {name === 'pause' && <Path {...common} fill={color} d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
      {name === 'back10' && <Path {...common} d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />}
      {name === 'forward10' && <Path {...common} d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4" />}
      {name === 'chevron' && <Path {...common} d="M9 6l6 6-6 6" />}
      {name === 'next' && (
        <>
          <Path {...common} fill={color} d="M5 5v14l10-7z" />
          <Path {...common} d="M18 5v14" />
        </>
      )}
      {name === 'turn' && (
        <>
          <Rect
            x={9.4}
            y={6.5}
            width={5.2}
            height={11}
            rx={1.3}
            transform="rotate(-45 12 12)"
            {...common}
            strokeWidth={1.6}
          />
          <Path
            {...common}
            strokeWidth={1.6}
            d="M2.6 8.5A10 10 0 0 1 8.5 2.6M6.2 1.9l2.3.7-.8 2.2M21.4 15.5A10 10 0 0 1 15.5 21.4M17.8 22.1l-2.3-.7.8-2.2"
          />
        </>
      )}
      {name === 'live' && (
        <>
          <Circle cx={12} cy={12} r={2.6} fill={color} />
          <Path
            {...common}
            d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"
          />
        </>
      )}
      {name === 'reel' && (
        <>
          <Circle {...common} strokeWidth={1.6} cx={12} cy={12} r={9.5} />
          <Rect {...common} strokeWidth={1.6} x={9} y={9} width={6} height={6} fill={fill} />
          <Path {...common} strokeWidth={1.4} d="M2.8 9H9M15 9h6.2M2.8 15H9M15 15h6.2" />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle {...common} cx={11} cy={11} r={7} />
          <Path {...common} d="M20 20l-3.5-3.5" />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle {...common} cx={12} cy={12} r={3} />
          <Path
            {...common}
            d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"
          />
        </>
      )}
      {name === 'ticket' && (
        <Path {...common} d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10" />
      )}
      {name === 'replay' && <Path {...common} d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />}
    </Svg>
  );
}

/** A gift icon from its SVG path. */
export function GiftGlyph({ path, size = 22 }: { path: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={path}
        stroke={colors.ink}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
