import { Component, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PU_ELEMENTS } from './pu-elements.data';
import { PuDriverUsage, PU_ELEMENT_LIST } from './pu-elements.model';
import { overLimit, penaltiesByDriver, teamColour, usageState } from './pu-usage';

@Component({
  selector: 'app-used-elements',
  imports: [MatIconModule, MatTooltipModule],
  templateUrl: './used-elements.component.html',
  styleUrl: './used-elements.component.scss',
})
export class UsedElementsComponent {
  protected readonly elements = PU_ELEMENT_LIST;
  protected readonly snapshot = PU_ELEMENTS;

  protected readonly rows = computed(() =>
    this.snapshot.drivers.map((d) => ({
      ...d,
      colour: teamColour(d.team),
      over: overLimit(d).length,
    })),
  );

  protected readonly penalties = computed(() => penaltiesByDriver(this.snapshot.penalties));

  protected state(driver: PuDriverUsage, index: number): string {
    const e = this.elements[index];
    return usageState(driver.used[e.key], e.limit);
  }

  protected isNew(driver: PuDriverUsage, index: number): boolean {
    return driver.new.includes(this.elements[index].key);
  }

  protected tip(driver: PuDriverUsage, index: number): string {
    const e = this.elements[index];
    const used = driver.used[e.key];
    const fitted = this.isNew(driver, index) ? ', fitted new this weekend' : '';
    return `${e.name}: ${used} used of ${e.limit} allowed${fitted}`;
  }
}
