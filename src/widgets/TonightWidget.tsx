import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  kerning,
  lineLimit,
  monospacedDigit,
  padding,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type TonightWidgetProps = {
  /** Show title, or '' when nothing is scheduled. */
  title: string;
  /** Premiere start, ms since 1970. */
  at: number;
  /** "Tonight", "Tomorrow", "Friday"… worked out by the app for this entry. */
  day: string;
  /** Deep link into the app. */
  url: string;
};

/**
 * "Tonight" on the home screen and lock screen: the next premiere with a live countdown.
 * Runs inside the widget extension, so everything it needs is in here (no outside constants).
 */
const TonightWidget = (props: TonightWidgetProps, env: WidgetEnvironment) => {
  'widget';
  const gold = '#FFB800';
  const goldLight = '#FFD25A';
  const parchment = '#F3EAD8';
  const muted = '#A8977A';
  const live = '#FF8A8E';
  const sky = {
    type: 'linearGradient' as const,
    colors: ['#5C3A12', '#1E150D', '#0D1213'],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 0.6, y: 1 },
  };

  const date = env.date ?? new Date();
  const now = date.getTime();
  const left = props.at - now;
  const stage = !props.title
    ? 'none'
    : left > 15 * 60 * 1000
      ? 'countdown'
      : left > 0
        ? 'doors'
        : -left < 45 * 60 * 1000
          ? 'live'
          : 'after';
  const eyebrow =
    stage === 'doors'
      ? 'DOORS OPEN'
      : stage === 'live'
        ? 'LIVE NOW'
        : stage === 'after'
          ? 'AFTER-CHAT'
          : `${props.day.toUpperCase()} · 8/7C`;
  const eyebrowColor = stage === 'live' ? live : gold;
  const within24h = left > 0 && left < 24 * 60 * 60 * 1000;
  const start = new Date(props.at);
  const range = { lower: new Date(props.at - 24 * 60 * 60 * 1000), upper: start };
  const clock = within24h ? (
    <Text
      timerInterval={{ lower: date, upper: start }}
      countsDown
      modifiers={[
        font({ size: 22, weight: 'bold', design: 'rounded' }),
        monospacedDigit(),
        foregroundStyle(parchment),
      ]}
    />
  ) : (
    <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(parchment)]}>
      {stage === 'live' ? 'Watch live' : stage === 'after' ? 'The cast is in the chat' : 'at 8/7c'}
    </Text>
  );

  if (stage === 'none') {
    return (
      <VStack modifiers={[containerBackground(sky, 'widget'), widgetURL(props.url)]}>
        <Image systemName="film.stack" color={gold} size={26} />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(muted)]}>
          New premieres soon
        </Text>
      </VStack>
    );
  }

  if (env.widgetFamily === 'accessoryInline') {
    return <Text>{stage === 'live' ? `Live now · ${props.title}` : `${props.title} · 8/7c`}</Text>;
  }

  if (env.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" modifiers={[widgetURL(props.url)]}>
        <Text modifiers={[font({ size: 11, weight: 'bold' }), kerning(1)]}>{eyebrow}</Text>
        <Text modifiers={[font({ size: 14, weight: 'semibold', design: 'serif' }), lineLimit(1)]}>
          {props.title}
        </Text>
        {within24h ? (
          <Text
            timerInterval={{ lower: date, upper: start }}
            countsDown
            modifiers={[monospacedDigit()]}
          />
        ) : null}
      </VStack>
    );
  }

  const titleText = (
    <Text
      modifiers={[
        font({
          size: env.widgetFamily === 'systemSmall' ? 17 : 20,
          weight: 'bold',
          design: 'serif',
        }),
        foregroundStyle(goldLight),
        lineLimit(3),
      ]}
    >
      {props.title.toUpperCase()}
    </Text>
  );
  const eyebrowText = (
    <Text
      modifiers={[font({ size: 10, weight: 'bold' }), kerning(2), foregroundStyle(eyebrowColor)]}
    >
      {eyebrow}
    </Text>
  );

  if (env.widgetFamily === 'systemMedium') {
    return (
      <HStack modifiers={[containerBackground(sky, 'widget'), widgetURL(props.url)]}>
        <VStack alignment="leading">
          {eyebrowText}
          <Spacer />
          {titleText}
          <Spacer />
          {clock}
        </VStack>
        <Spacer />
        <VStack>
          <Image systemName="film.circle" color={gold} size={44} />
          <Spacer />
          {within24h ? (
            <ProgressView
              timerInterval={range}
              countsDown
              modifiers={[tint(gold), frame({ width: 72 })]}
            />
          ) : null}
        </VStack>
      </HStack>
    );
  }

  // systemSmall
  return (
    <VStack
      alignment="leading"
      modifiers={[containerBackground(sky, 'widget'), widgetURL(props.url), padding({ all: 2 })]}
    >
      <HStack>
        {eyebrowText}
        <Spacer />
      </HStack>
      <Spacer />
      {titleText}
      <Spacer />
      {clock}
    </VStack>
  );
};

export default createWidget('TonightWidget', TonightWidget);
