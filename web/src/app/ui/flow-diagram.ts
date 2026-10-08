import { Component } from '@angular/core';
import { InView } from './in-view';

@Component({
  selector: 'app-flow',
  imports: [InView],
  template: `
    <div class="flow" appInView>
      <svg viewBox="0 0 760 88" role="img" aria-label="Request, approve, sign, then pay">
        <line class="flow-line" x1="48" y1="28" x2="712" y2="28" pathLength="1" />
        @for (step of steps; track step.title; let i = $index) {
          <rect class="flow-mark" [attr.x]="36 + i * 220" y="16" width="24" height="24" pathLength="1" />
          <text class="flow-num" [attr.x]="48 + i * 220" y="33">{{ i + 1 }}</text>
        }
      </svg>
      <ol class="steps">
        @for (step of steps; track step.title; let i = $index) {
          <li [style.--i]="i">
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
