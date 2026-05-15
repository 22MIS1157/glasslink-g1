import { Command } from './types';

const COMMAND_NAMES: Record<number, string> = {
  [Command.SET_LED_BRIGHTNESS]: 'Set LED Brightness',
  [Command.GET_BATTERY]:        'Get Battery',
  [Command.TAKE_PHOTO]:         'Take Photo',
  [Command.ACTION_SYNC]:        'Action Sync',
  [Command.CHARGING_STATUS]:    'Charging Status',
  [Command.SYNC_TIME]:          'Sync Phone Time',
};

export function getCommandName(cmd: number): string {
  return COMMAND_NAMES[cmd] ?? `Unknown (0x${cmd.toString(16).padStart(2, '0').toUpperCase()})`;
}

export { COMMAND_NAMES };
