import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  kerning,
  lineLimit,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type PremiereActivityProps = {
  title: string;
  /** Premiere start, ms since 1970. */
  at: number;
  stage: 'countdown' | 'doors' | 'live' | 'after';
};

/**
 * The premiere on the lock screen and in the Dynamic Island: a countdown to 8/7c that ticks on its
 * own, then Doors open, Live now and the after-chat. Tapping it opens the lobby.
 */
const PremiereActivity = (props: PremiereActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  const gold = env.isLuminanceReduced ? '#FFFFFF' : '#FFB800';
  const goldLight = '#FFD25A';
  const parchment = '#F3EAD8';
  const live = '#FF8A8E';
  const start = new Date(props.at);
  const counting = props.stage === 'countdown' || props.stage === 'doors';
  const label =
    props.stage === 'doors'
      ? 'DOORS OPEN'
      : props.stage === 'live'
        ? 'LIVE NOW'
        : props.stage === 'after'
          ? 'AFTER-CHAT'
          : 'TONIGHT · 8/7C';
  const labelColor = props.stage === 'live' ? live : gold;
  const timer = (size: number) => (
    <Text
      timerInterval={{ lower: new Date(), upper: start }}
      countsDown
      modifiers={[
        font({ size, weight: 'bold', design: 'rounded' }),
        monospacedDigit(),
        foregroundStyle(parchment),
      ]}
    />
  );
  const status = (size: number) =>
    counting ? (
      timer(size)
    ) : (
      <Text
        modifiers={[
          font({ size, weight: 'bold' }),
          foregroundStyle(props.stage === 'live' ? live : parchment),
        ]}
      >
        {props.stage === 'live' ? 'Watch' : 'Join'}
      </Text>
    );

  return {
    banner: (
      <HStack modifiers={[padding({ all: 16 }), activityBackgroundTint('#15100B')]}>
        <Image systemName="film.circle.fill" color={gold} size={38} />
        <VStack alignment="leading">
          <Text
            modifiers={[
              font({ size: 11, weight: 'bold' }),
              kerning(2),
              foregroundStyle(labelColor),
            ]}
          >
            {label}
          </Text>
          <Text
            modifiers={[
              font({ size: 17, weight: 'bold', design: 'serif' }),
              foregroundStyle(goldLight),
              lineLimit(1),
            ]}
          >
            {props.title}
          </Text>
        </VStack>
        <Spacer />
        {status(26)}
      </HStack>
    ),
    compactLeading: <Image systemName="film.circle.fill" color={gold} />,
    compactTrailing: counting ? (
      <Text
        timerInterval={{ lower: new Date(), upper: start }}
        countsDown
        modifiers={[monospacedDigit(), foregroundStyle(gold), frame({ maxWidth: 56 })]}
      />
    ) : (
      <Text modifiers={[foregroundStyle(props.stage === 'live' ? live : gold)]}>
        {props.stage === 'live' ? 'LIVE' : 'Chat'}
      </Text>
    ),
    minimal: <Image systemName="film.circle.fill" color={props.stage === 'live' ? live : gold} />,
    expandedLeading: (
      <VStack alignment="leading" modifiers={[padding({ leading: 6 })]}>
        <Image systemName="film.circle.fill" color={gold} size={30} />
      </VStack>
    ),
    expandedTrailing: <VStack modifiers={[padding({ trailing: 6 })]}>{status(24)}</VStack>,
    expandedBottom: (
      <VStack alignment="leading" modifiers={[padding({ horizontal: 8 })]}>
        <Text
          modifiers={[font({ size: 11, weight: 'bold' }), kerning(2), foregroundStyle(labelColor)]}
        >
          {label}
        </Text>
        <Text
          modifiers={[
            font({ size: 18, weight: 'bold', design: 'serif' }),
            foregroundStyle(goldLight),
            lineLimit(1),
          ]}
        >
          {props.title}
        </Text>
      </VStack>
    ),
  };
};

export default createLiveActivity('PremiereActivity', PremiereActivity);
