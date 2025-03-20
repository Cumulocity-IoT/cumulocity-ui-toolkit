import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'operations-value',
  templateUrl: './operations-value.component.html',
})
export class OperationsValueComponent implements OnInit {
  @Input() value: string;
  @Output() valueChange = new EventEmitter<string>();

  isValidJson: boolean;

  onUpdate(event: Event) {
    this.isValidJson = this.validJson(this.value);
    this.valueChange.emit(this.value);
  }

  ngOnInit() {
    this.isValidJson = this.validJson(this.value);
  }

  private validJson(value: string): boolean {
    try {
      JSON.parse(this.value);

      return true;
    } catch (e) {
      this.isValidJson = false;

      return false;
    }
  }
}
