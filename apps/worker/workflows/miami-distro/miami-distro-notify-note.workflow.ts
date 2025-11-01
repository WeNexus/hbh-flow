import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';
import { AxiosError } from 'axios';

@Workflow({
  name: 'Miami Distro - Notify Cliq channel about note',
  concurrency: 1,
  webhook: true,
})
export class MiamiDistroNotifyNoteWorkflow extends WorkflowBase {
  constructor(private readonly zohoService: ZohoService) {
    super();
  }

  private logger = new Logger(MiamiDistroNotifyNoteWorkflow.name);

  @Step(1)
  async execute() {
    await this.zohoService.iterateCliqDB({
      connection: 'miami_distro',
      db: 'kartkonnectchannels',
      criteria: 'topic==crm_account_note_added',
      callback: async (record) => {
        try {
          await this.zohoService.post(
            `/api/v2/channelsbyname/${record.channel}/message?bot_unique_name=kartkonnect`,
            this.payload,
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
          ...this.payload,
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
