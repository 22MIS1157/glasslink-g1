import {
  ParsedPacket, Command, LEDBrightness, PhotoMode, ChargingState,
} from './types';

// returns a human-readable description of what the packet means
export function interpretPacket(parsed: ParsedPacket): string {
  const dir = parsed.direction === 'app_to_device' ? 'App -> Device' : 'Device -> App';

  switch (parsed.command) {
    case Command.SET_LED_BRIGHTNESS: {
      if (parsed.data.length === 0) return `${dir} | Set LED Brightness (no level)`;
      const names: Record<number, string> = {
        [LEDBrightness.LOW]: 'Low', [LEDBrightness.MEDIUM]: 'Medium', [LEDBrightness.HIGH]: 'High',
      };
      const level = names[parsed.data[0]] ?? `0x${parsed.data[0].toString(16)}`;
      return `${dir} | Set LED Brightness -> ${level}`;
    }

    case Command.GET_BATTERY: {
      if (parsed.direction === 'app_to_device') return `${dir} | Get Battery (request)`;
      if (parsed.data.length >= 2) {
        const charging = parsed.data[1] === ChargingState.CHARGING ? 'charging' : 'not charging';
        return `${dir} | Battery ${parsed.data[0]}% (${charging})`;
      }
      return `${dir} | Get Battery (malformed reply)`;
    }

    case Command.TAKE_PHOTO: {
      if (parsed.data.length === 0) return `${dir} | Take Photo (no mode)`;
      const modes: Record<number, string> = {
        [PhotoMode.PHOTO_ONLY]: 'Photo Only', [PhotoMode.PHOTO_HD_UPLOAD]: 'Photo + HD Upload',
      };
      return `${dir} | Take Photo -> ${modes[parsed.data[0]] ?? '?'}`;
    }

    case Command.ACTION_SYNC: {
      if (parsed.data.length < 9) return `${dir} | Action Sync (incomplete)`;
      const labels = ['photo', 'recording', 'mic', 'vol+', 'vol-', 'nod', 'shake', 'music', 'worn'];
      const active = labels.filter((_, i) => parsed.data[i] !== 0);
      return `${dir} | Action Sync -> [${active.length ? active.join(', ') : 'idle'}]`;
    }

    case Command.CHARGING_STATUS: {
      if (parsed.data.length < 2) return `${dir} | Charging Status (malformed)`;
      const state = parsed.data[0] === ChargingState.CHARGING ? 'Charging' : 'Not Charging';
      return `${dir} | ${state}, Level: ${parsed.data[1]}%`;
    }

    case Command.SYNC_TIME: {
      if (parsed.data.length < 7) return `${dir} | Sync Time (incomplete)`;
      const year = (parsed.data[0] << 8) | parsed.data[1];
      const p = (n: number) => n.toString().padStart(2, '0');
      return `${dir} | Sync Time -> ${year}-${p(parsed.data[2])}-${p(parsed.data[3])} ${p(parsed.data[4])}:${p(parsed.data[5])}:${p(parsed.data[6])}`;
    }

    default: {
      const hex = Array.from(parsed.data).map(b => b.toString(16).padStart(2, '0')).join(' ');
      return `${dir} | Unknown Cmd 0x${parsed.command.toString(16)} | Data: [${hex}]`;
    }
  }
}
