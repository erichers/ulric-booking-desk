import { Composition } from 'remotion';
import { DeskReel } from './DeskReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="DeskReel"
      component={DeskReel}
      durationInFrames={750}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
