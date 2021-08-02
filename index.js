const Websocket = require("ws");
const fetch = require('node-fetch').default;
const fs = require("fs");
const blessed = require('blessed');
const screen = blessed.screen({
    fullUnicode: true,
    sendFocus: true,
});

let loggedIn = false;
let isDead = false;
let user = {
    displayName: "none"
};
let channel = {
    name: "none",
    id: undefined
};
let group = {
    name: "none",
    id: undefined
};
let groups = [];
let channels = [];
let users = [];

async function apiPost(path, body) {
    return await (await fetch(`https://api.plugify.cf/v2/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token
        },
        body: JSON.stringify(body)
    })).json();
}

const logBox = blessed.box({
    parent: screen,
    left: 0,
    top: '75%',
    height: '25%',
    width: '50%',
    border: 'line',
    label: 'Logs',
});

const logText = blessed.log({
    parent: logBox,
    left: 0,
    top: 0,
    height: '86%',
    width: '96%',
    content: '',
    mouse: true,
    scrollable: true,
});

function log(content) {
    logText.log(content);
    screen.render();
}

const groupsBox = blessed.box({
    parent: screen,
    left: 0,
    top: 0,
    height: '75%',
    width: '16%',
    border: 'line',
    label: 'Groups',
});

const groupList = blessed.list({
    parent: groupsBox,
    left: 0,
    top: 0,
    height: '91.6%',
    width: '87.5%',
    style: {
        item: {
            hover: {
                bg: 'blue'
            }
        },
        selected: {
            bg: 'blue',
            bold: true
        }
    },
    clickable: true,
    keys: true,
    mouse: true,
    items: [],
});

groupList.on('select', async (el, selected) => {
    const group = groups[groupList.getItemIndex(el)];
    if(!group) return log('Error updating channels.');
    const channels = await fetchChannels(group.id);
    updateChannels(channels);
});

groupList.focus();

const channelsBox = blessed.box({
    parent: screen,
    left: '16%',
    top: 0,
    height: '75%',
    width: '20%',
    border: 'line',
    label: 'Channels',
});

const channelList = blessed.list({
    parent: channelsBox,
    left: 0,
    top: 0,
    height: '91.6%',
    width: '90%',
    style: {
        item: {
            hover: {
                bg: 'blue'
            }
        },
        selected: {
            bg: 'blue',
            bold: true
        }
    },
    keys: true,
    mouse: true,
    items: [],
});

channelList.on('select', async (el, selected) => {
    const channel = channels[channelList.getItemIndex(el)];
    if(!channel) return log('Error joining channel.');
    log('Joining channel...');
    joinChannel(channel);
});

const messagesBox = blessed.box({
    parent: screen,
    left: '36%',
    top: 0,
    height: '60%',
    width: '64%',
    border: 'line',
    label: 'Messages',
    mouse: true,
});

const messagesText = blessed.log({
    parent: messagesBox,
    left: 0,
    top: 0,
    height: '96%',
    width: '96%',
    mouse: true,
    scrollable: true,
});

const promptBox = blessed.box({
    parent: screen,
    left: '36%',
    top: '60%',
    height: '15%',
    width: '64%',
    border: 'line',
    label: 'Input',
});

const inputBox = blessed.textbox({
    parent: promptBox,
    left: 0,
    top: 0,
    height: '86%',
    width: '96%',
    inputOnFocus: true,
    mouse: true,
});

inputBox.on('submit', () => {
    handleInput(inputBox.getValue());
    inputBox.clearValue();
});

const globalActionsBox = blessed.box({
    parent: screen,
    left: '50%',
    top: '75%',
    height: '25%',
    width: '25%',
    border: 'line',
    label: 'Actions (global)',
});

const gactions = ['Create new group', 'Get user info', 'Use an invite', 'Quit plugify-blessed'];
const gactionList = blessed.list({
    parent: globalActionsBox,
    left: 0,
    top: 0,
    height: '86%',
    width: '86%',
    style: {
        item: {
            hover: {
                bg: 'blue'
            }
        },
        selected: {
            bg: 'blue',
            bold: true
        }
    },
    keys: true,
    mouse: true,
    items: gactions,
});

const actionPrompt = blessed.prompt({
    parent: screen,
    top: '40%',
    left: '40%',
    height: '20%',
    width: '20%',
    style: {
        bg: 'grey',
    },
    input: true,
});

gactionList.on('select', async (el, selected) => {
    const actionIndex = gactionList.getItemIndex(el);
    switch (actionIndex) {
        case 0:
            log('Waiting for group name...');
            actionPrompt.focus();
            actionPrompt.readInput('Enter group name', '', async (e, value) => {
                if (!value) return log('The buttons are broken. Use the enter key instead.');
                log(`Creating group with name ${value}...`);
                const data = await apiPost('groups/create', { 'name': value });
                if (data.success) return log(`Created group with ID ${data.data.id}`);
                log(`Error: ${data.error}`);
            });
            break;
        case 1:
            log('Waiting for user name...');
            actionPrompt.focus();
            actionPrompt.readInput('Enter user name', '', async (e, value) => {
                if (!value) return log('The buttons are broken. Use the enter key instead.');
                log(`Getting user info of @${value.replace(/@/g, '')}...`);
                const data = await (await fetch(`https://api.plugify.cf/v2/users/info/${value.replace(/@/g, '')}`)).json();
                if (data.success) {
                    const flags = {
                        pro: (data.data.flags & 1 << 0) === 1 << 0,
                        dev: (data.data.flags & 1 << 1) === 1 << 1,
                        early: (data.data.flags & 1 << 2) === 1 << 2,
                        closedBeta: (data.data.flags & 1 << 3) === 1 << 3,
                    };
                    const labels = {
                        pro: ' \x1b[42mPRO\x1b[0m',
                        dev: ' \x1b[44mDEV\x1b[0m',
                        early: ' \x1b[45mEARLY\x1b[0m',
                        closedBeta: ' \x1b[43mBETA\x1b[0m'
                    }
                    return log(`----\n${data.data.displayName} (@${data.data.name})${flags.pro ? labels.pro : ''}${flags.dev ? labels.dev : ''}${flags.early ? labels.early : ''}${flags.closedBeta ? labels.closedBeta : ''}\nAvatar URL: ${data.data.avatarURL}\n----`);
                }
                switch (data.error) {
                    case 8:
                        log('User doesn\'t exist');
                        break;
                    default:
                        log(`Error: ${data.error}`);
                }
            });
            break;
        case 2:
            log('Waiting for invite code...');
            actionPrompt.focus();
            actionPrompt.readInput('Enter invite code', '', async (e, value) => {
                if (!value) return log('The buttons are broken. Use the enter key instead.');
                log(`Attemping to use invite \`${value}\`...`);
                const data = await apiPost('invites/use', { 'id': value });
                if (data.success) return log('Invite used successfully.');
                switch (data.error) {
                    case 9:
                        log('Group doesn\'t exist');
                        break;
                    case 13:
                        log('Invite doesn\'t exist');
                        break;
                    default:
                        log(`Error: ${data.error}`);
                }
            });
            break;
        case 3:
            log('Quitting');
            process.exit(0);
        default:
            log('How did you get here?');
            break;
    }
});

screen.key('C-c', function() {
    process.exit(0);
});

screen.render();

const token = fs.readFileSync("token", { encoding: "utf-8" });

const ws = new Websocket('wss://api.plugify.cf/');

ws.onopen = () => {
    log('WS | Opened.');
    setInterval(() => {
        if (isDead) {
            log('We lost connection with Plugify server. Quitting.');
            process.exit(1);
        }
        ws.send(JSON.stringify({ event: 9001 })); 
        isDead = true; 
    }, 10000);
}
ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    switch (data.event) {
        case 0:
            ws.send(JSON.stringify({ event: 1, data: { token: token } }))
            break;

        case 2:
            loggedIn = true;
            user = data.data;
            log('WS | Logged in.');
            ws.send(JSON.stringify({ event: 11 }));
            break;

        case 5:
            channel = data.data.channel;
            messagesText.setContent('');
            if (data.data.history) data.data.history.forEach(message => handleMessage(message));
            break;
        
        case 6:
            log('WS | Channel join error.');
            log(data.data);
            break;

        case 10:
            handleMessage(data.data);
            break;

        case 12:
            log('WS | Got groups.');
            updateGroups(data.data);
            break;

        case 15:
            log('WS | Joined new group.');
            log('You have joined a new group. If the group list does not refresh, restart plugify-blessed.');
            ws.send(JSON.stringify({ event: 11 }));
            break;

        case 9001:
            isDead = false;
            break;
    }
}

function updateGroups(groupsData) {
    groups = groupsData;
    groupList.setItems(groupsData.map(group => group.name));
    screen.render();
}

async function fetchChannels(group) {
    const data = await apiPost('groups/info', { 'id': group });
    log('API | Fetching channels');
    if (data.success && data.data.channels) return data.data.channels;
    console.log(`Error when fetching channels for group ${group}.`);
}

function updateChannels(channelsData) {
    channels = channelsData;
    channelList.setItems(channelsData.map(channel => `#${channel.name}`));
    screen.render();
}

function joinChannel(channel) {
    ws.send(JSON.stringify({ event: 4, data: { id: channel.id } }));
}

function handleMessage(data) {
    const author = data.author;
    users[author.username] = author;
    const time = new Date(data.timestamp);
    const timeString = `${time.getHours() < 10 ? '0' : ''}${time.getHours()}:${time.getMinutes() < 10 ? '0' : ''}${time.getMinutes()}`;
    let content = data.content;
    let output = '';
    if (content.match(new RegExp(`<@${user.username}>`))) {
        output = '\x1b[47m\x1b[30m';
        content = content.replace(/<@([a-z0-9_-]+)>/gi, '@$1');
    } else {
        content = content.replace(/<@([a-z0-9_-]+)>/gi, '\x1b[47m\x1b[30m@$1\x1b[0m');
    }
    output += `${timeString} [${author.displayName} (@${author.username})]: ${content}\x1b[0m`;
    messagesText.log(output);
    screen.render();
}

function handleInput(input) {
    const line = input.split(" ");
    if (input.charAt(0) !== '.') {
        sendMessage(input);
    }
}

function sendMessage(input) {
    if (!channel.id) {
        log("You should join a channel first.");
        return;
    }
    if (ws.readyState == 1 && loggedIn) {
        ws.send(JSON.stringify({ event: 7, data: { content: input } }));
    }
}