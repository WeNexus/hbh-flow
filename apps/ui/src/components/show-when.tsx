import { type FC, type PropsWithChildren } from 'react';
import type { CSSProperties } from '@mui/material';

import {
  type UseTransitionProps,
  useTransition,
  animated,
} from '@react-spring/web';

const animations = {
  fadeSlideY: {
    from: { opacity: 0, transform: 'translateY(-20px)' },
    enter: { opacity: 1, transform: 'translateY(0)' },
    leave: { opacity: 0, transform: 'translateY(-20px)' },
    config: { duration: 100 },
  } satisfies UseTransitionProps,
  zoom: {
    from: { opacity: 0, transform: 'scale(0.9)' },
    enter: { opacity: 1, transform: 'scale(1)' },
    leave: { opacity: 0, transform: 'scale(0.9)' },
    config: { duration: 100, bounce: 0.2 },
  } satisfies UseTransitionProps,
  fade: {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    config: { duration: 100 },
  } satisfies UseTransitionProps,
  fadeSlideX: {
    from: { opacity: 0, transform: 'translateX(-20px)' },
    enter: { opacity: 1, transform: 'translateX(0)' },
    leave: { opacity: 0, transform: 'translateX(-20px)' },
    config: { duration: 100 },
  } satisfies UseTransitionProps,
  fadeSlideYReverse: {
    from: { opacity: 0, transform: 'translateY(20px)' },
    enter: { opacity: 1, transform: 'translateY(0)' },
    leave: { opacity: 0, transform: 'translateY(20px)' },
    config: { duration: 100 },
  } satisfies UseTransitionProps,
};

export interface AnimatedShowHideProps<P = any> extends PropsWithChildren {
  animation?: keyof typeof animations;
  component?: FC<P>;
  props?: P;
  when: boolean;
  style?: CSSProperties;
}

export function ShowWhen<P>({
  component,
  animation,
  children,
  when,
  props,
  style,
}: AnimatedShowHideProps<P>) {
  const transition = useTransition(when, animations[animation || 'fadeSlideY']);

  const Container = component ? animated(component) : animated.div;

  return transition(
    (styles, when) =>
      when && (
        // @ts-expect-error - animated.div expects a style prop
        <Container style={{ ...styles, ...(style ?? {}) }} {...props}>
          {children}
        </Container>
      ),
  );
}
