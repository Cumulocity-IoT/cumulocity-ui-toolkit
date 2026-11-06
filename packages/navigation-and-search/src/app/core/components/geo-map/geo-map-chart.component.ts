import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  type OnDestroy,
} from '@angular/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { GeoMapCategory } from './geo-map.types';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export interface GeoMapChartPoint {
  label?: string;
  value?: number;
  categoryId?: string;
  x?: number | string;
  y?: number;
}

/**
 * Renders one popup `chart` section. Canvas can't resolve CSS custom
 * properties, so category token colors are resolved via getComputedStyle.
 */
@Component({
  selector: 'ps-geo-map-chart',
  standalone: true,
  template: '',
  styles:
    ':host { display: block; height: 110px; width: 100%; max-width: 100%; overflow: hidden; }',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeoMapChartComponent implements OnDestroy {
  readonly kind = input.required<'bar' | 'pie' | 'line'>();
  readonly data = input.required<GeoMapChartPoint[]>();
  readonly categories = input<Map<string, GeoMapCategory>>(new Map());

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private chart?: echarts.ECharts;
  // The popup content is (re)attached to Leaflet's DOM after creation and the
  // popup resizes itself around its content — keep the canvas matched to the host.
  private readonly resizeObserver = new ResizeObserver(() => this.chart?.resize());

  constructor() {
    effect(() => {
      const kind = this.kind();
      const data = this.data() ?? [];
      const categories = this.categories();

      if (!this.chart) {
        this.chart = echarts.init(this.host.nativeElement);
        this.resizeObserver.observe(this.host.nativeElement);
      }
      this.chart.setOption(this.buildOption(kind, data, categories), { notMerge: true });
      this.chart.resize();
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    this.chart?.dispose();
  }

  private resolveColor(color: string | undefined): string | undefined {
    if (!color) return undefined;
    if (!color.includes('var(')) return color;
    const el = this.host.nativeElement;
    const previous = el.style.color;

    el.style.color = color;
    const resolved = getComputedStyle(el).color;

    el.style.color = previous;

    return resolved;
  }

  private buildOption(
    kind: 'bar' | 'pie' | 'line',
    data: GeoMapChartPoint[],
    categories: Map<string, GeoMapCategory>
  ): echarts.EChartsCoreOption {
    const pointColor = (p: GeoMapChartPoint) =>
      this.resolveColor(p.categoryId ? categories.get(p.categoryId)?.color : undefined);

    if (kind === 'pie') {
      // Values must be readable without hovering; outside slice labels get
      // clipped in the fixed-height host, so names + values live in a legend
      // ABOVE the chart instead.
      const valueByName = new Map(data.map((p) => [p.label ?? '', p.value ?? 0]));
      return {
        tooltip: { trigger: 'item', confine: true },
        legend: {
          top: 0,
          left: 'center',
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { fontSize: 11 },
          formatter: (name: string) => `${name}: ${valueByName.get(name) ?? ''}`,
        },
        series: [
          {
            type: 'pie',
            radius: ['30%', '55%'],
            center: ['50%', '65%'],
            label: { show: false },
            data: data.map((p) => ({
              name: p.label ?? '',
              value: p.value ?? 0,
              itemStyle: pointColor(p) ? { color: pointColor(p) } : undefined,
            })),
          },
        ],
      };
    }

    if (kind === 'line') {
      return {
        tooltip: { trigger: 'axis', confine: true },
        grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
        xAxis: { type: 'category', data: data.map((p) => String(p.x ?? p.label ?? '')) },
        yAxis: { type: 'value' },
        series: [{ type: 'line', showSymbol: false, data: data.map((p) => p.y ?? p.value ?? 0) }],
      };
    }

    return {
      tooltip: { trigger: 'axis', confine: true },
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: data.map((p) => p.label ?? '') },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: data.map((p) => ({
            value: p.value ?? 0,
            itemStyle: pointColor(p) ? { color: pointColor(p) } : undefined,
          })),
        },
      ],
    };
  }
}
