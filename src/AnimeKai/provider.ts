/// <reference path="./online-streaming-provider.d.ts" />
/// <reference path="./doc.d.ts"/>

class Provider {
  api = "https://animekai.to";
  getSettings(): Settings {
    return {
      episodeServers: ["Server 1", "Server 2"],
      supportsDub: true,
    };
  }

  async search(query: any, dub: boolean): Promise<SearchResult[]> {
    let normalizedQuery = this.normalizeQuery(query["query"]);
    console.log("Normalized Query: " + normalizedQuery);

    const url = `${this.api}/browser?keyword=${encodeURIComponent(
      normalizedQuery
    )}`;

    try{
      const data = await this._makeRequest(url);
      const $ = LoadDoc(data);
      const animes: SearchResult[] = [];
      $("div.aitem-wrapper>div.aitem").each((_, elem) => {
        const id = elem.find("a.poster").attr("href")?.slice(1) ?? "";
        const title = elem.find("a.title").attr("title") ?? "";
        const subOrDub: SubOrDub = this.isSubOrDubOrBoth(elem);
        const url = `${this.api}/${id.slice(1)}`;
  
        const anime: SearchResult = {
          id: `${id}?dub=${query['dub']}`,
          url: url,
          title: title,
          subOrDub: subOrDub,
        };
  
        animes.push(anime);
      });
  
      return animes;
    }
    catch(ex:any){
      throw new Error(ex);
    } 
  }

  async findEpisodes(id: string): Promise<EpisodeDetails[]> {

    const url = `${this.api}/${id.split('?dub')[0]}`;
    const rateBoxIdRegex = /<div class="rate-box"[^>]*data-id="([^"]+)"/;
    try{
      let data: any = await this._makeRequest(url);
      const idMatch = data.match(rateBoxIdRegex);
      const aniId = idMatch ? idMatch[1] : null;
      const urlFetchToken = KAICODEX.enc(aniId);
  
      const fetchUrlListApi = `${this.api}/ajax/episodes/list?ani_id=${aniId}&_=${urlFetchToken}`;
      const responseTextListApi = await this._makeRequest(fetchUrlListApi);
      data = await JSON.parse(responseTextListApi);
  
      const episodes: EpisodeDetails[] = [];
  
      const $ = LoadDoc(data.result);
      $('ul.range>li>a').each((_, elem) => {
        const title = elem.find('span').text().replace(/\s/g, ' ');
        const number = parseInt(elem.attr('num')!, 10)
        const token = elem.attr('token');
        const tokenEncoded = KAICODEX.enc(token);
        const episodeUrl = `https://animekai.to/ajax/links/list?token=${token}&_=${tokenEncoded}`;
  
        episodes.push({
          id: token ?? "",
          number: number,
          title: title,
          url: `${episodeUrl}?dub=${id.split('?dub=')[1]}`
        });
      })
  
      return episodes;
    }
    catch(ex:any){
      throw new Error(ex);
    }
  }

  async findEpisodeServer(
    episode: EpisodeDetails,
    _server: string
  ): Promise<EpisodeServer> {
    let server = "Server 1";
    if (_server !== "default") server = _server;

    const episodeUrl = episode.url.replace('\u0026', '&').split('?dub')[0];
    const dubRequested = episode.url.split('?dub=')[1];

    try {
      const responseText = await this._makeRequest(episodeUrl);

      const cleanedHtml = cleanJsonHtml(responseText);

      const subRegex = /<div class="server-items lang-group" data-id="sub"[^>]*>([\s\S]*?)<\/div>/;
      const softsubRegex = /<div class="server-items lang-group" data-id="softsub"[^>]*>([\s\S]*?)<\/div>/;
      const dubRegex = /<div class="server-items lang-group" data-id="dub"[^>]*>([\s\S]*?)<\/div>/;

      const subMatch = subRegex.exec(cleanedHtml);
      const softsubMatch = softsubRegex.exec(cleanedHtml);
      const dubMatch = dubRegex.exec(cleanedHtml);

      const sub = subMatch ? subMatch[1].trim() : "";
      const softsub = softsubMatch ? softsubMatch[1].trim() : "";
      const dub = dubMatch ? dubMatch[1].trim() : "";

      let dataLid = "";
      let fetchUrlServerApi: any = "";
      let KaiMegaUrlJson: any = "";
      let megaELinkJson: any = ""
      let megaEmbeddedUrl: any = "";
      let megaMediaUrl: any = "";
      let streamUrlJson: any = "";
      let streamUrl: any = "";
      let serverSpanRegex: any = "";

      // Find server 1 span and extract data-lid
      if (server == "Server 1")
        serverSpanRegex = /<span class="server"[^>]*data-lid="([^"]+)"[^>]*>Server 1<\/span>/;
      else
        serverSpanRegex = /<span class="server"[^>]*data-lid="([^"]+)"[^>]*>Server 2<\/span>/;

      const serverMatch = dubRequested === 'true' ? serverSpanRegex.exec(dub) : serverSpanRegex.exec(sub);

      if (serverMatch && serverMatch[1]) {
        dataLid = serverMatch[1];
        let dataLidToken: any = KAICODEX.enc(dataLid);

        fetchUrlServerApi = `https://animekai.to/ajax/links/view?id=${dataLid}&_=${dataLidToken}`;

        const responseTextServerApi = await this._makeRequest(fetchUrlServerApi);
        const dataServerApi = await JSON.parse(responseTextServerApi);

        KaiMegaUrlJson = KAICODEX.dec(dataServerApi.result);
        megaELinkJson = JSON.parse(KaiMegaUrlJson);
        megaEmbeddedUrl = megaELinkJson.url;
        megaMediaUrl = megaEmbeddedUrl.replace("/e/", "/media/");

        // Fetch the media url
        const mediaText = await this._makeRequest(megaMediaUrl);
        const mediaJson = await JSON.parse(mediaText);

        streamUrlJson = mediaJson.result;
        streamUrlJson = KAICODEX.decMega(streamUrlJson);
        const parsedStreamData = JSON.parse(streamUrlJson);

        if (parsedStreamData && parsedStreamData.sources && parsedStreamData.sources.length > 0) {
          streamUrl = parsedStreamData.sources[0].file;
        } else {
          console.log('No stream sources found in the response' + parsedStreamData);
        }
      }

      if (streamUrl == "") {
        throw new Error("Unable to find a valid source")
      }

      const streams = await fetch(streamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "DNT": "1"
        }
      });

      //Regex to extract all the resolutions and url related to the resolutions available
      const regex = /#EXT-X-STREAM-INF:BANDWIDTH=\d+,RESOLUTION=(\d+x\d+)\s*(.*)/g;
      const videoSources: VideoSource[] = [];

      let resolutionMatch;
      
      while ((resolutionMatch = regex.exec(await streams.text())) !== null) {
        
        let url = "";

        if (resolutionMatch[2].includes("list")) {
          url = `${streamUrl.split(',')[0]}/${resolutionMatch[2]}`;
        }
        else {
          url = `${streamUrl.split('/list')[0]}/${resolutionMatch[2]}`
        }

        videoSources.push({
          quality: resolutionMatch[1].split('x')[1] + 'p', // 1920x1080 -> 1080p
          subtitles: [], //Subs are already integrated in the video source
          type: 'm3u8', //Standard type for AnimeKai
          url: url  
        });
      }

      const episodeServer: EpisodeServer = {
        server: server,
        headers: {
          "Access-Control-Allow-Origin": "*",
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0'
        },
        videoSources: [...videoSources]
      };

      return episodeServer

    }
    catch (e: any) {
      throw new Error(e);
    }
  }

  normalizeQuery(query: string): string {
    let normalizedQuery = query
      .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1") //Removes suffixes from a number I.e. 3rd, 1st, 11th, 12th, 2nd -> 3, 1, 11, 12, 2
      .replace(/\s+/g, " ") //Replaces 1+ whitespaces with 1 whitespace
      .replace(/(\d+)\s*Season/i, "$1") //Removes season and keeps the number before the Season word
      .replace(/Season\s*(\d+)/i, "$1") //Removes season and keeps the number after the Season word
      .trim();

    return normalizedQuery;
  }
  
  async _makeRequest(url: string): Promise<string> {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "DNT": "1",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
        Cookie: "__ddg1_=;__ddg2_=;",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    const body = await response.text();
    return body;
  }

  isSubOrDubOrBoth(elem: DocSelection): SubOrDub {
    const sub = elem.find("span.sub").text();
    const dub = elem.find("span.dub").text();

    if (sub != "" && dub != "") {
      return "both";
    }
    if (sub != "") {
      return "sub";
    }

    return "dub";
  }


}

const KAICODEX = {
  /* ANIMEKAI CODEX */
  enc(n: any) {
    var u = KAICODEX.safeBtoa;
    var a = KAICODEX.rc4;
    var s = KAICODEX.replaceChars;
    var r = KAICODEX.reverseString;
    n = u(
      s(
        u(
          a(
            'sXmH96C4vhRrgi8',
            r(
              r(
                u(
                  a('kOCJnByYmfI', s(
                    s(
                      r(
                        u(
                          a('0DU8ksIVlFcia2', n)
                        )
                      ),
                      '1wctXeHqb2', '1tecHq2Xbw'
                    ),
                    '48KbrZx1ml', 'Km8Zb4lxr1'
                  )
                  )
                )
              )
            )
          )
        ), 'hTn79AMjduR5', 'djn5uT7AMR9h')
    );
    return encodeURIComponent(n);
  },
  encPlain(n: any) {
    return KAICODEX.safeBtoa(KAICODEX.rc4(
      'n1PEbDBiipbJZvZc',
      encodeURIComponent(n)
    ));
  },
  dec(n: any) {
    var u = KAICODEX.safeAtob;
    var a = KAICODEX.rc4;
    var s = KAICODEX.replaceChars;
    var r = KAICODEX.reverseString;
    n = a(
      '0DU8ksIVlFcia2',
      u(
        r(
          s(
            s(
              a('kOCJnByYmfI',
                u(
                  r(
                    r(
                      a(
                        'sXmH96C4vhRrgi8',
                        u(
                          s(
                            u(n),
                            'djn5uT7AMR9h',
                            'hTn79AMjduR5'
                          )
                        )
                      )
                    )
                  )
                )
              ), 'Km8Zb4lxr1', '48KbrZx1ml'
            ),
            '1tecHq2Xbw', '1wctXeHqb2'
          )
        )
      )
    )
    return decodeURIComponent(n);
  },
  decPlain(n: any) {
    return decodeURIComponent(
      KAICODEX.rc4(
        'n1PEbDBiipbJZvZc',
        KAICODEX.safeAtob(n)
      )
    );
  },
  decMega(n: any) {
    var o = KAICODEX.safeAtob;
    var e = KAICODEX.rc4;
    var c = KAICODEX.replaceChars;
    var v = KAICODEX.reverseString;
    n = c(
      e('fnxEj3tD4Bl0X',
        o(
          e('IjilzMV57GrnF',
            o(
              c(
                v(
                  c(
                    e(
                      'PlzI69YVCtGwoa8',
                      o(
                        o(n)
                      )
                    ),
                    'c2IfHZwSX1mj',
                    'mwfXcS2ZjI1H'
                  )
                ),
                '82NkgQDYbIF',
                '82IQNkFgYbD'
              )
            )
          )
        )
      ),
      'crwkth05iJR8',
      'JRkt8rw0i5ch'
    );
    return decodeURIComponent(n);
  },

  /* Helper */
  rc4: function (key: any, str: string) {
    var s = [], j = 0, x, res = '';
    for (var i = 0; i < 256; i++) {
      s[i] = i;
    }
    for (i = 0; i < 256; i++) {
      j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
      x = s[i];
      s[i] = s[j];
      s[j] = x;
    }
    i = 0;
    j = 0;
    for (var y = 0; y < str.length; y++) {
      i = (i + 1) % 256;
      j = (j + s[i]) % 256;
      x = s[i];
      s[i] = s[j];
      s[j] = x;
      res += String.fromCharCode(str.charCodeAt(y) ^ s[(s[i] + s[j]) % 256]);
    }
    return res;
  },
  safeBtoa: function (s: any) {
    return btoa(s).replace(/\//g, '_').replace(/\+/g, '-').replace(/\=/g, '');
  },
  safeAtob: function (s: any) {
    return atob(s.replace(/_/g, '/').replace(/-/g, '+'));
  },
  reverseString: function (s: any) {
    return s.split('').reverse().join('');
  },
  replaceChars: function (s: any, f: any, r: any) {
    let i = f.length;
    let m: any = {};
    while (i-- && (m[f[i]] = r[i])) { }
    return s.split("").map((v: any) => m[v] || v).join('');
  }
};

function btoa(input: any) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = String(input);
  let output = '';

  for (let block = 0, charCode, i = 0, map = chars;
    str.charAt(i | 0) || (map = '=', i % 1);
    output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))) {
    charCode = str.charCodeAt(i += 3 / 4);
    if (charCode > 0xFF) {
      throw new Error("btoa failed: The string contains characters outside of the Latin1 range.");
    }
    block = (block << 8) | charCode;
  }

  return output;
}

function atob(input: any) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = String(input).replace(/=+$/, '');
  let output = '';

  if (str.length % 4 == 1) {
    throw new Error("atob failed: The input is not correctly encoded.");
  }

  for (let bc = 0, bs: any, buffer, i = 0;
    (buffer = str.charAt(i++));
    ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4)
      ? output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)))
      : 0) {
    buffer = chars.indexOf(buffer);
  }

  return output;
}

function cleanHtmlSymbols(string: string) {
  if (!string) return "";

  return string
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#[0-9]+;/g, "")
    .replace(/\r?\n|\r/g, " ")  // Replace any type of newline with a space
    .replace(/\s+/g, " ")       // Replace multiple spaces with a single space
    .trim();                    // Remove leading/trailing whitespace
}

function cleanJsonHtml(jsonHtml: string) {
  if (!jsonHtml) return "";

  return jsonHtml
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
}