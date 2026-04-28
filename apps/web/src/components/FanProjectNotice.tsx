import { ShellNotice } from './ShellNotice';

/** @deprecated Use ShellNotice with a placement-specific notice config. */
export function FanProjectNotice() {
  return <ShellNotice placement="room-frame" />;
}
