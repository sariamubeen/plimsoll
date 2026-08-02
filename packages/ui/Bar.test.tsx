import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { unavailableReading, type UsageReading } from '@plimsoll/core/types';
import { Bar } from './Bar.tsx';
import { Panel } from './Panel.tsx';

/**
 * The render layer is the last place the "never 0%" rule can be broken, and the only
 * place a user would actually see it broken. These tests assert on the emitted markup
 * rather than on props, because a correct reading rendered wrongly is still a lie.
 */

const NOW = 1_800_000_000_000;

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

const reading = (over: Partial<UsageReading> = {}): UsageReading => ({
  key: 'session',
  percent: 18,
  primary: '18% used',
  provenance: 'usage-page',
  capturedAt: NOW,
  confidence: 'exact',
  ...over,
});

describe('an unknown reading', () => {
  const html = render(
    <Bar reading={unavailableReading('weekly', NOW)} warnAt={75} criticalAt={90} />,
  );

  it('renders "n/a" and never a percentage', () => {
    expect(html).toContain('n/a');
    expect(html).not.toContain('0%');
  });

  it('renders a hatched track rather than an empty bar', () => {
    // An empty track is visually identical to "0% used", which is the exact lie this
    // project exists to avoid.
    expect(html).toContain('track--unknown');
    expect(html).not.toContain('class="fill');
  });

  it('reports no aria-valuenow to assistive tech', () => {
    // Announcing "0" would be the accessibility equivalent of an empty bar.
    expect(html).not.toContain('aria-valuenow');
    expect(html).toContain('aria-valuetext="not available"');
  });

  it('says "not available" in words', () => {
    expect(html).toContain('Not available on this site');
  });
});

describe('a known reading', () => {
  it('pairs the colour band with a text label', () => {
    // Never colour alone: the band name appears as text and in the accessible name.
    const html = render(<Bar reading={reading({ percent: 95 })} warnAt={75} criticalAt={90} />);
    expect(html).toContain('fill--critical');
    expect(html).toContain('Very high');
    expect(html).toContain('aria-valuenow="95"');
  });

  it('shows the provenance chip', () => {
    expect(render(<Bar reading={reading()} warnAt={75} criticalAt={90} />)).toContain('page');
    expect(
      render(<Bar reading={reading({ provenance: 'dom-estimate' })} warnAt={75} criticalAt={90} />),
    ).toContain('est.');
  });

  it('marks a stale reading as stale', () => {
    const html = render(
      <Bar reading={reading({ confidence: 'stale' })} warnAt={75} criticalAt={90} />,
    );
    expect(html).toContain('row--stale');
    expect(html).toContain('stale');
  });

  it('clamps the fill width to 100% for an over-range value', () => {
    const html = render(<Bar reading={reading({ percent: 150 })} warnAt={75} criticalAt={90} />);
    expect(html).toContain('width:100%');
  });
});

describe('panel freshness', () => {
  const props = {
    readings: [reading()],
    visibleBars: { context: true, session: true, weekly: true, credits: true, warning: true },
    position: 'bottom-right' as const,
    collapsed: false,
    warnAt: 75,
    criticalAt: 90,
    stalenessWindowMs: 600_000,
    busy: false,
    onToggleCollapsed: () => undefined,
    onRefresh: () => undefined,
  };

  it('states when it last updated', () => {
    expect(render(<Panel {...props} now={NOW} lastUpdatedAt={NOW} />)).toContain('just now');
  });

  it('flags a cached reading as stale rather than letting it look live', () => {
    const html = render(<Panel {...props} now={NOW + 3_600_000} lastUpdatedAt={NOW} />);
    expect(html).toContain('stale');
    expect(html).toContain('1h ago');
  });

  it('says so when nothing has been read yet', () => {
    expect(render(<Panel {...props} now={NOW} lastUpdatedAt={null} />)).toContain('Not read yet');
  });

  it('carries the read-only guarantee for screen readers', () => {
    expect(render(<Panel {...props} now={NOW} lastUpdatedAt={NOW} />)).toContain(
      'never modifies, bypasses, or extends',
    );
  });
});
