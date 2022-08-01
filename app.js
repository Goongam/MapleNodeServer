var express = require('express');
var app = express();
const cors = require('cors');
const oracledb = require('oracledb');

app.use(cors({ //모든 요청에 대해 특정 미들웨어를 적용하고 싶다면 use를 이용합니다.
    origin: '*', //모든 출처허용 true도 가능
}));
app.use(express.json());
//서버 켜기: nodemon app.js





//API
const soapRequest = require("easy-soap-request");
const convert = require('xml-js');
const fs = require('fs');

const url = "http://api.maplestory.nexon.com/soap/maplestory.asmx?wsdl";

const getData = async (callback, id)=>{
    let xml = 
        `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
                <GetCharacterInfoByAccountID xmlns="https://api.maplestory.nexon.com/soap/">
                    <AccountID>`+id+`</AccountID>
                </GetCharacterInfoByAccountID>
            </soap:Body>
        </soap:Envelope>`;

    const sampleHeaders={
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': xml.length,
        'SOAPAction': "https://api.maplestory.nexon.com/soap/GetCharacterInfoByAccountID"
    };

    try {
        const {response} = await soapRequest({
            url:url,
            xml:xml,
            headers : sampleHeaders,
            timeout : 1000,
        });
        
        const {header, body, statusCode} = response;
        //console.log(body)
        
        var xmlToJson = convert.xml2json(body,{compact:true, sapces:4});
        callback(xmlToJson,id);
        
        return 1;
    } catch (error) {
        console.log("ErrorID1:"+id);
       return 0;
    }
}


let connection;
async function connectDB(){
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    connection = await oracledb.getConnection({
    user          : "ljw",
    password      : "123123",
    connectString : "xe"
    });
}
async function getIdbyNick(nick){
    try {
        const result = await connection.execute("select id from MapleIdList where nickname = :nick",[nick]);
        return result.rows[0].ID;
    } catch (error) {
        return error;
    }
}

app.post('/data', async function(req, res){
    //res.header("Access-Control-Allow-Origin", "*");

    const reqNick = req.body.Nick;
    let reqId = await getIdbyNick(reqNick);

    if(isNaN(reqId)) {
        console.log("에러:",reqId);
        res.send({"error":"없는 닉네임 or DB연결 오류"});
        return;
    }

    console.log(reqId);

    let msg = await getData( (XML) => {
        const body = JSON.parse(XML);
        const data = body['soap:Envelope']['soap:Body']['GetCharacterInfoByAccountIDResponse']['GetCharacterInfoByAccountIDResult']['diffgr:diffgram']['NewDataSet']['UserInfo'];
        CharData = data['CharacterName']['_text'];
        console.log(data);
        res.send(data);
    }, reqId);

    if(!msg) res.send(`{ "data" : "실패" }`);
    

});




//Crawler
const axios = require('axios');
const cheerio = require('cheerio');

const client = axios.create({
    // ❶ 실제 크롬 웹 브라우저에서 보내는 값과 동일하게 넣기
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.134 Safari/537.36 Edg/103.0.1264.77',
    },
});
//검색 기본정보
async function getBasicInfoHTML(nick){
    const url = encodeURI(`https://maplestory.nexon.com/Ranking/World/Total?c=${nick}&w=0`);
    const cafe_resp = await client.get(url);
    const $ = cheerio.load(cafe_resp.data);
    const CharacterInfo = $(".search_com_chk");
    if($(CharacterInfo).text() === "") return "NULL"
    
    return CharacterInfo;
    
}
//검색 캐릭터 정보 URL
async function getSearchURL(nick){
    const url = encodeURI(`https://maplestory.nexon.com/Ranking/World/Total?c=${nick}&w=0`);
    const cafe_resp = await client.get(url);
    const $ = cheerio.load(cafe_resp.data);
    const CharacterInfo = $(".search_com_chk");

    if($(CharacterInfo).text() === "") return "NULL"
    
    return "https://maplestory.nexon.com"+CharacterInfo.find("td.left > dl > dt > a").attr("href");
    
}

//랭킹정보 URL
async function getinfoURL(ChracterURL){
    const resp = await client.get(ChracterURL);
    const $ = cheerio.load(resp.data);
    const data = $("#container > div.con_wrap > div.lnb_wrap > ul > li:nth-child(1) > a");
    return "https://maplestory.nexon.com"+data.attr("href") 
}

//랭킹정보
async function getRankingInfo(infoURL){
    const respInfo = await client.get(infoURL);
    const $ = cheerio.load(respInfo.data);
    const RankRowTable = $("#container > div.con_wrap > div.contents_wrap > div > table > tbody > tr");
    
    //1집계날짜	    2종합랭킹	3월드랭킹	4직업랭킹	5인기도랭킹	    6레벨	7경험치
    return ranks = {
        "Dates" : RankRowTable.map((index,el)=>$(el).find(":nth-child(1)").text()).toArray(),
        "TotalRanks" : RankRowTable.map((index,el)=>$(el).find(":nth-child(2)").text()).toArray(),
        "Levs" : RankRowTable.map((index,el)=>$(el).find(":nth-child(6)").text()).toArray(),
        "Exps" : RankRowTable.map((index,el)=>$(el).find(":nth-child(7)").text()).toArray(),
    }


}

async function getSearchUnionInfo(nick){
    const URL = encodeURI(`https://maplestory.nexon.com/Ranking/Union?c=${nick}`);
    const respUnion = await client.get(URL);
    const $ = cheerio.load(respUnion.data);
    const unionData = $('tr.search_com_chk');
    const isNoneData = $('.none_list2').text();

    if(isNoneData === "랭킹정보가 없습니다.") return "NoRankInfo";

    let unionRank = unionData.find(".ranking_other").text() === "" ? 
        unionData.find(".ranking_num > img").attr("alt").charAt(0) :
        unionData.find(".ranking_other").text().replace(/\n|\r|\s*/g, "");;

    return {
        "unionRank" : unionRank,
        "unionLev" : unionData.find("td:nth-child(3)").text(),

    };

}






async function getRankArray(nick){
    
    const searchURL = await getSearchURL(nick);
    if(searchURL === "NULL") return "NULL";

    const infoURL = await getinfoURL(searchURL);
    const infoData = await getRankingInfo( infoURL );
    return(infoData);

}

async function getBasicInfo(nick){

    const InfoHTML = await getBasicInfoHTML(nick);
    if(InfoHTML === "NULL") return "NULL";

    BasicInfo = {
        "Job":InfoHTML.find("td.left > dl > dd").text(),
        "Lv":InfoHTML.find("td:nth-child(3)").text(),
        "Exp":InfoHTML.find("td:nth-child(4)").text(),
        "Popularity":InfoHTML.find("td:nth-child(5)").text(),
        "Guild":InfoHTML.find("td:nth-child(6)").text(),
        "Img":InfoHTML.find("td.left > .char_img > img").attr("src"),
    }


    return BasicInfo;

}

async function getUnionRank(nick){
   const UnionData = await getSearchUnionInfo(nick);
   return UnionData;
}



app.get('/MapleCrawling/info/:nick', async function(req, res){
    //const RankData = await getRankArray(req.params.nick);
    const BasicInfoData = await getBasicInfo(req.params.nick);

    if(BasicInfoData === "NULL") {
        res.send({"error" : "찾을 수 없는 닉네임"});
        return;
    }

    res.send(
        { 
        "info": BasicInfoData
        });
});

app.get('/MapleCrawling/rank/:nick', async function(req, res){
    const RankData = await getRankArray(req.params.nick);
    // const BasicInfoData = await getBasicInfo(req.params.nick);

    if(RankData === "NULL") {
        res.send({"error" : "찾을 수 없는 닉네임"});
        return;
    }

    res.send(
        { 
        "Rank" : RankData
        });
});

app.get('/MapleCrawling/union/:nick',async function(req,res){
    unionData = await getUnionRank(req.params.nick);
    console.log(unionData);
    res.send({
        "Union" : unionData,
    });
});

app.listen(3001, function(){
    console.log("start!!");
    connectDB();
});