const recaptcha2 = require('recaptcha2')
const is = require('is-html');

const { server: { id, admin_user_ids }, bot_options: { max_owners_count }, web: { recaptcha_v2: { site_key, secret_key } } } = require("@root/config.json");

const recaptcha = new recaptcha2({
    siteKey: site_key,
    secretKey: secret_key
})

module.exports = async (req, b = null) => {
    let data = req.body;

    // User hasn't submitted a captcha
    if (!data.recaptcha_token)
        return { success: false, message: "Invalid Captcha" }

    // Validate captcha
    try {
        await recaptcha.validate(data.recaptcha_token)
    } catch (e) {
        return { success: false, message: "Invalid Captcha" }
    }

    // Max length for summary is 120 characters
    if (data.description.length > 120) return { success: false, message: "Your summary is too long." };

    // Check if summary has HTML.
    if (is(data.description))
        return { success: false, message: "HTML is not supported in your bot summary" }

    // Check that all the fields are filled in
    if (!data.long.length || !data.description.length || !data.prefix.length)
        return { success: false, message: "Invalid submission. Check you filled all the fields." }

    // Check the user is in the main server.
    try {
        await req.app.get('client').guilds.cache.get(id).members.fetch(req.user.id);
    } catch (e) {
        return { success: false, message: "You aren't in the server", button: { text: "Join", url: "/join" } }

    }
    // Search for a user with discord
    let bot;
    try {
        bot = await req.app.get('client').users.fetch(req.params.id)
        if (!bot.bot)
            return { success: false, message: "Invalid ID. User is not a bot" }
    } catch (e) {
        // Invalid bot ID
        if (e.message.endsWith("is not snowflake.") || e.message == "Unknown User")
            return { success: false, message: "Invalid bot ID" }
        else
            return { success: false, message: "Could not find user" }
    }

    /* 
        Check that the user signed is either:
        - The primary owner
        - An additional owner
        - A server admin
    */
    if (
        b &&
        b.owners.primary !== req.user.id &&
        !b.owners.additional.includes(req.user.id) &&
        !admin_user_ids.includes(req.user.id)
    )
        return { success: false, message: "Invalid request. Please sign in again.", button: { text: "Logout", url: "/logout" } }

    // If the additional owners have been changed, check that the primary owner is editing it
    if (
        b &&
        data.owners.replace(',', '').split(' ').remove('').join() !== b.owners.additional.join() &&
        b.owners.primary !== req.user.id
    )
        return { success: false, message: "Only the primary owner can edit additional owners" };

    let users = data.owners.replace(',', '').split(' ').remove('');
    users = users.filter(id => /[0-9]{16,20}/g.test(id))

    try {
        /* 
            Filter owners:
            - Is in the server
            - Is not a bot user
            - Is not duplicate
        */
        users = await req.app.get('client').guilds.cache.get(id).members.fetch({ user: users });
        users = [...new Set(users.map(x => { return x.user }).filter(user => !user.bot).map(u => u.id))];

        // Check if additional owners exceed max
        if (users.length > max_owners_count)
            return { success: false, message: `You can only add up to ${max_owners_count} additional owners` };

        return { success: true, bot, users }
    } catch (e) {
        return { success: false, message: "Invalid Owner IDs" };
    }
}
