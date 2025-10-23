import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import { AxiosError } from 'axios';

@Workflow({
  name: 'Miami Distro - Notify Cliq about new customer signup',
  webhook: true,
})
export class MiamiDistroCustomerNotificationWorkflow extends WorkflowBase {
  constructor(
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  private logger = new Logger(MiamiDistroCustomerNotificationWorkflow.name);

  getSource() {
    return new URL(this.payload._links.self[0].href).origin;
  }

  @Step(1)
  async execute() {
    if (!this.payload.id) {
      return this.cancel();
    }

    const user = this.payload;

    const payload = {
      text: `A new customer account has been created in ${this.getSource()} — ${new Intl.DateTimeFormat(
        'en-US',
        {
          hour: 'numeric',
          minute: 'numeric',
          hour12: true,
          timeZone: 'America/New_York',
          timeZoneName: 'short',
          day: 'numeric',
          month: 'short',
        },
      ).format(new Date())}.`,
      card: {
        title: `${user.email} — New Account`,
        theme: 'modern-inline',
      },
      slides: [
        {
          type: 'label',
          title: 'Details',
          data: [
            { 'First Name': user.first_name },
            { 'Last Name': user.last_name },
          ],
        },
      ],
    };

    await this.zohoService.iterateCliqDB({
      connection: 'miami_distro',
      db: 'kartkonnectchannels',
      criteria: 'topic==new_customer',
      callback: async (record) => {
        try {
          await this.zohoService.post(
            `/api/v2/channelsbyname/${record.channel}/message?bot_unique_name=kartkonnect`,
            payload,
            {
              connection: 'miami_distro',
              baseURL: 'https://cliq.zoho.com',
            },
          );
        } catch (e) {
          if (e instanceof AxiosError) {
            this.logger.error(e.response?.data);
          } else {
            this.logger.error(e);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000)); // Adding a delay of 1 second between messages
      },
    });

    try {
      await this.zohoService.post(
        `/api/v2/bots/kartkonnect/message`,
        {
          ...payload,
          broadcast: true,
        },
        {
          connection: 'miami_distro',
          baseURL: 'https://cliq.zoho.com',
        },
      );
    } catch (e) {
      if (e instanceof AxiosError) {
        this.logger.error(e.response?.data);
      } else {
        this.logger.error(e);
      }
    }
  }
}
