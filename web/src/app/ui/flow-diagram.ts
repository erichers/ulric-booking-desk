import { Component } from '@angular/core';
import { InView } from './in-view';

@Component({
  selector: 'app-flow',
  imports: [InView],
  template: `
    <div class="flow" appInView>
      <ol class="steps" aria-label="Request, approve, sign, then pay">
        @for (step of steps; track step.title; let i = $index) {
          <li [style.--i]="i">
            <span class="step-num" aria-hidden="true">{{ i + 1 }}</span>
            <strong>{{ step.title }}</strong>
            <p>{{ step.body }}</p>
          </li>
        }
      </ol>
    </div>
  `,
})
export class FlowDiagram {
  readonly steps = [
    { title: 'Request', body: 'The guest picks open dates and sends a hold.' },
    { title: 'Approve', body: 'The host accepts. The desk writes the contract and the invoice.' },
    { title: 'Sign', body: 'The guest signs on the page. The file keeps the time and the IP.' },
    { title: 'Pay', body: 'After approval the guest pays with PayPal or Venmo. The host marks the stay paid, and the nights are confirmed.' },
  ];
}
