% Paste this into ThingSpeak Apps > MATLAB Analysis > New > Custom.
% Configure the three values below, then create the React and TimeControl
% rules described in the dashboard's Email alert setup page.
channelID = 3585570;
readKey = 'YOUR_READ_API_KEY';
alertsKey = 'YOUR_ALERTS_API_KEY';
monitorFrom = 'REPLACE_WITH_UTC_START_TIME';

if contains(monitorFrom, 'REPLACE')
    error('Set monitorFrom to the UTC start time shown in the setup page.');
end
startTime = datetime(monitorFrom, 'InputFormat', "yyyy-MM-dd'T'HH:mm:ss'Z'", ...
    'TimeZone', 'UTC');
feedURL = sprintf('https://api.thingspeak.com/channels/%d/feeds.json', channelID);
feed = webread(feedURL, 'api_key', readKey, 'results', 100, ...
    weboptions('Timeout', 15));
rows = feed.feeds;
if isempty(rows)
    disp('No channel data yet.');
    return;
end

% Alert history supplies a persistent watermark, even across analysis runs.
% Use this same analysis for both the React and the TimeControl rules.
prefix = sprintf('Parcel %d wrong through #', channelID);
options = weboptions('HeaderFields', {'ThingSpeak-Alerts-API-Key', alertsKey}, ...
    'Timeout', 15);
history = webread('https://api.thingspeak.com/alerts/history', ...
    'count', 100, 'subject_contains', prefix, options);
watermark = 0;
for i = 1:numel(history)
    subject = string(history(i).subject);
    if startsWith(subject, prefix) && ~strcmpi(string(history(i).status), 'failed')
        entry = str2double(extractAfter(subject, prefix));
        if isfinite(entry)
            watermark = max(watermark, entry);
        end
    end
end

pending = 0;
lastEntry = 0;
lastWrong = 0;
lastRow = [];
previous = NaN;
for i = 1:numel(rows)
    row = rows(i);
    current = str2double(string(row.field2));
    if ~isfinite(current)
        continue;
    end
    recorded = datetime(row.created_at, ...
        'InputFormat', "yyyy-MM-dd'T'HH:mm:ss'Z'", 'TimeZone', 'UTC');
    % A decreasing counter means the ESP32 restarted.
    if isnan(previous)
        increase = 0;
    elseif current < previous
        increase = current;
    else
        increase = current - previous;
    end
    if recorded >= startTime && row.entry_id > watermark && increase > 0
        pending = pending + increase;
        lastEntry = row.entry_id;
        lastWrong = increase;
        lastRow = row;
    end
    previous = current;
end
if pending == 0
    disp('No new wrong-parcel counts to report.');
    return;
end

subject = sprintf('%s%d', prefix, lastEntry);
body = sprintf('%d new wrong-tray parcel(s) recorded. Latest affected cloud entry #%d.', ...
    pending, lastEntry);
if pending == 1 && lastWrong == 1 && str2double(string(lastRow.field4)) == 2
    expected = str2double(string(lastRow.field5));
    observed = str2double(string(lastRow.field6));
    names = {'None', 'Tray A', 'Tray B'};
    if ismember(expected, [1 2]) && ismember(observed, [1 2])
        body = sprintf('%s Expected %s. Detected %s.', ...
            body, names{expected+1}, names{observed+1});
    end
end
body = sprintf('%s Open your Parcel dashboard for the latest totals.', body);
options.MediaType = 'application/json';
webwrite('https://api.thingspeak.com/alerts/send', ...
    struct('subject', subject, 'body', body), options);
disp('Email request accepted. Check ThingSpeak Alerts history for delivery.');
