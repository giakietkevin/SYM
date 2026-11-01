import { describe, expect, it } from 'vitest';
import { ago, deviceLabel } from './device';

describe('deviceLabel', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Chrome · Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0', 'Edge · Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari · iPhone'],
    ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36', 'Samsung Internet · Android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox · macOS'],
    ['', 'Thiết bị không rõ'],
  ])('%s', (ua, want) => expect(deviceLabel(ua)).toBe(want));
});

describe('ago', () => {
  const now = 1_000_000_000_000;
  it('reads like a person would say it', () => {
    expect(ago(now - 10_000, now)).toBe('vừa xong');
    expect(ago(now - 5 * 60_000, now)).toBe('5 phút trước');
    expect(ago(now - 3 * 3600_000, now)).toBe('3 giờ trước');
    expect(ago(now - 2 * 86400_000, now)).toBe('2 ngày trước');
  });
});
