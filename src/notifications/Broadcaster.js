'use strict';

const { resolveRoles } = require('../CommonFunctions');

const makePingsMentionable = async (ping, { guild, client }) => {
  if (guild.members.get(client.user.id).hasPermission('MANAGE_ROLES', false, true, true)) {
    const roles = resolveRoles({ content: ping, guild });
    const alteredRoles = [];
    await Promise.all(roles.map(async (role) => {
      if (!role.mentionable) {
        await role.setMentionable(true, `${role.name} set pingable`);
        alteredRoles.push(role);
      }
    }));
    return alteredRoles;
  }

  return [];
};

const makePingsUnmentionable = async (roles) => {
  const unmadePingable = [];
  if (roles.map) {
    await Promise.all(roles.map(async (role) => {
      if (role && role.mentionable) {
        await role.setMentionable(false, `${role.name} set unpingable`);
        unmadePingable.push(role);
      }
    }));
  }
  return unmadePingable;
};

/**
 * Broadcast updates out to subscribing channels
 * @param {Discord.Client} client         bot client
 * @param {Database} settings settings object for fetching data
 *    information about current channel, guild, and bot settings
 * @param {MessageManager} messageManager manages messages, including sending, deleing, and webhooks
 * @param {Logger|console} logger         Logger for errors and debugging
 */
class Broadcaster {
  constructor({
    client = undefined, settings = undefined, messageManager = undefined, logger = console,
  }) {
    this.client = client;
    this.settings = settings;
    this.messageManager = messageManager;
    this.logger = logger;
  }

  /**
   * Broadcast embed to all channels for a platform and type
   * @param  {Object} embed      Embed to send to a channel
   * @param  {string} platform   Platform of worldstate
   * @param  {string} type       Type of new data to notify
   * @param  {Array}  [items=[]] Items to broadcast
   * @param {number} [deleteAfter=0] Amount of time to delete broadcast after
   * @returns {Array.<Object>} values for successes
   */
  async broadcast(embed, platform, type, items = [], deleteAfter = 0) {
    const channels = await this.settings.getNotifications(type, platform, items);
    return Promise.all(channels.map(async (result) => {
      const channel = this.client.channels.get(result.channelId);
      if (channel) {
        if (channel.type === 'text') {
          return this.sendWithPrepend(channel, embed, type, items, deleteAfter);
        }
        if (channel.type === 'dm') {
          return this.messageManager.embedToChannel(channel, embed, '', deleteAfter);
        }
      }
      return undefined;
    }));
  }

  async sendWithoutPrepend(channel, embed, deleteAfter) {
    const ctx = await this.settings.getCommandContext(channel);
    ctx.deleteAfterDuration = deleteAfter;
    return this.messageManager.webhook(
      ctx,
      { embed: this.messageManager.webhookWrapEmbed(embed) },
    );
  }

  async sendWithPrepend(channel, embed, type, items, deleteAfter) {
    const prepend = await this.settings
      .getPing(channel.guild, (items || []).concat([type]));
    const ctx = await this.settings.getCommandContext(channel);
    ctx.deleteAfterDuration = deleteAfter;
    let roles = [];
    if (prepend && prepend.length) {
      roles.unshift(await makePingsMentionable(
        prepend,
        { client: this.client, guild: channel.guild },
      ));
      roles = roles[0].filter(role => typeof role !== 'undefined');
    }

    await this.messageManager.webhook(
      ctx,
      { text: prepend, embed: this.messageManager.webhookWrapEmbed(embed, ctx) },
    );

    if (prepend && prepend.length && roles.length) {
      await makePingsUnmentionable(roles);
    }
    return true;
  }
}

module.exports = Broadcaster;
