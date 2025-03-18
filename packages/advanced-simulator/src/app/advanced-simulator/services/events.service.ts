import { Injectable } from '@angular/core';
import { Event } from '../models/events.model';
import { BasicEventInstruction, EventInstruction } from '../models/instruction.model';

@Injectable()
export class EventsService {
  events: Event[] = [];

  setEvents(events: Event[]) {
    this.events = events;
  }

  pushToEvents(events: EventInstruction | BasicEventInstruction) {
    this.events.push(events);
  }
}
