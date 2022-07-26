var express = require('express');
var app = express();
const cors = require('cors');
const oracledb = require('oracledb');

app.use(cors({ //모든 요청에 대해 특정 미들웨어를 적용하고 싶다면 use를 이용합니다.
    origin: '*', //모든 출처허용 true도 가능
}));
app.use(express.json());
//서버 켜기: nodemon app.js

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


app.listen(3001, function(){
    console.log("start!!");
    connectDB();
});