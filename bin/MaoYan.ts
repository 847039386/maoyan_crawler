import { DealDate } from "./util/dealDate"
import * as cheerio from 'cheerio';
import * as agent from 'superagent';

import * as fs from 'fs';
import { Movie ,IMovie ,BoxOffice  } from "./models/index"
import { MaoYanData } from "./Interface/IMaoYanData"
import { MYOffice } from "./Interface/IMYOffice"





export class MaoYan {
    private dealDate : DealDate;    //封装的方法。
    private reptile_url : string;   //爬虫网站
    constructor(){
        this.dealDate = new DealDate("2016-11-07");
        this.reptile_url = "http://piaofang.maoyan.com/";
    }
    async start(){
        this.dealDate.getDaysData();
        await this.getListDate(this.dealDate.cur_reptile_dates.currentDates)
        //以下循环 ，暂且搁置  华丽分割线 ---------------------------------------------------------
        this.dealDate.changeTime();
        let over = this.dealDate.isOver();
        if(over){
            await this.start();
        }

    }
    async getListDate(dates : any[]){
        for(let i=0; i<dates.length; i++){
            await this.resolveList(dates[i])
        }
    }
    getIDLists(mos : MYOffice[]) :any[] {
        let cur_list :any[] = [];
        mos.forEach(m => {
            cur_list.push(m.id);
        })
        return cur_list;
    }
    async resolveListToDetail(list : any[])  {
        for(let i=0; i<list.length; i++){
           await this.resolveDetail(list[i]);        //处理内容页
        }
    }
    async resolveList(date :string) {
        this.debug_Date(date)                            //debug --- 输出当前时间
        let html = await this.getHtmlList(date)         //获取选定时间的列表Html
        let mos = await this.listDetail(date,html)      //获取list的爬虫数据 ，这是一个数组，有爬虫的所有数据
        await this.saveBoxOffices(mos)                         //列表数据入库。
        let list = this.getIDLists(mos)                 //利用正则匹配每个电影的编号。这是一个数组，只有id的数组
        await this.resolveListToDetail(list)            //循环列表页的所有电影，并到每个页面拿到数据，并且做存库操作。他是一个void类型的方法。
    }
    async resolveDetail(id : number)  {
        let html = await this.getHtmlDetail(id)                                 //获取内容页的Html并转义。
        let maoyan_data : MaoYanData =  this.getMaoyanDetail(id,html);         //获取内容页的数据。
        this.debug_MaoyanData(maoyan_data);                                    //debug ----- 输出数据
        this.updateMovie(maoyan_data.name,maoyan_data);                       //入库并提示。
    }


    async listDetail(date :string ,html :string) : Promise<any> {
        let reg = /\/(\w*)\.ttf/;
        let reg_id = /([1-9]\d*\.?\d*)|(0\.\d*[1-9])/
        let mos : MYOffice[] = []
        html = await this.clTts(reg.exec(html)[1] + ".ttf",html);
        let $ : any = cheerio.load(html);
        $("#ticket_tbody ul.canTouch").each((idx :number,ele :any) => {
            let myoffice = new MYOffice();
            myoffice.box_date = date;
            myoffice.id = $(ele).attr("data-com").match(reg_id)[0];
            myoffice.name = $(ele).find("li.c1 b").text();
            myoffice.film_realTime = $(ele).find("li.c2 b i.cs").text();
            myoffice.film_zb = $(ele).find("li.c3 i.cs").text();
            myoffice.paipian_zb = $(ele).find("li.c4 i.cs").text();
            myoffice.attendance = $(ele).find("li.c5 i.cs").text();
            myoffice.film_days = $(ele).find("li.c1 em").first().text();
            mos.push(myoffice)
        })
        return new Promise(resolve =>{ resolve(mos) });
    }
    async getHtmlList(date : string) : Promise<any> {
        await this.dealDate.wait_seconds(2);
        let url = this.reptile_url + "?date=" + date;
        let html = await agent("GET",url);
        return new Promise((resolve ,reject) => {
            resolve(html.text)
        })
    }
    async getHtmlDetail(id :number) : Promise<any> {
        let html :any ,url ,res,reg;
        url = this.reptile_url + "movie/"+ id +"?_v_=yes"
        reg = /\/(\w*)\.ttf/;
        await this.dealDate.wait_seconds(0.5);
        res = await agent("GET",url);
        html = await this.clTts(reg.exec(res.text)[1] + ".ttf",res.text);
        return new Promise((resolve ,reject) => {
            resolve(html)
        })
    }
    getMaoyanDetail(id :number ,html: string) : MaoYanData {
        let $ : any;
        $ = cheerio.load(html);
        let maoyan_data : MaoYanData = new MaoYanData()
        maoyan_data.id = id;
        maoyan_data.name = $(".info-detail .info-title").text();
        maoyan_data.score =  this.deleteSpace($(".info-score .left p.score-num ").text());
        maoyan_data.z_score = this.deleteSpace($(".info-score .right p.score-num ").text())  || "暂无" ;
        $(".box-summary .box-detail").each(( idx : number ,ele :any) => {
            let piaofang = this.deleteSpace($(ele).text())
            switch (idx){
                case 0 :
                    maoyan_data.total_bo = piaofang
                    break;
                case 1 :
                    maoyan_data.week_bo = piaofang
                    break;
                case 2 :
                    maoyan_data.day_bo = piaofang
                    break;
            }
        })
        return maoyan_data
    }
    debug_MaoyanData(my : MaoYanData) : void {
        console.log("----------------------------------------------------")
        console.log("编号：" + my.id)
        console.log("名字：" + my.name)
        console.log("观众：" + my.score)
        console.log("专家：" + my.z_score)
        console.log("累计：" + my.total_bo)
        console.log("首周：" + my.week_bo)
        console.log("首日：" + my.day_bo)
    }
    debug_Date(date : string) : void {
        console.log("----------------------------------------------------")
        console.log("                      " +  date )
        console.log("----------------------------------------------------")
    }
    deleteSpace(str : any) : any {
        return str.replace(/(^\s+)|(\s+$)/g, "")
    }
    anaTts(str :string ,ttf :string) : string{
        let arr = ttf.match(/uni(\w{4})/g);
        if (arr && arr.length && arr.length === 10) {
            for (let i = 0; i < arr.length; i++) {
                str = str.replace(new RegExp(arr[i].toLowerCase().replace('uni', '&#x') + ';', 'g'), i.toString());
            }
        }
        return str;
    }
    downFile(filename : string) : Promise<any> {
        const font_url = 'http://p0.meituan.net/colorstone/' + filename;
        const stream = fs.createWriteStream("./bin/font/" + filename);
        const req = agent.get(font_url);
        let pro =  new Promise((resolve ,reject) => {
            req.on("error",err => { console.log("下载出错"); reject(err) })
                .pipe(stream)
                .on("close",() => { resolve(true) })
        })
        return pro;
    }
    clTts(filename :string ,str :string) : Promise<any> {
        return new Promise(async (resolve ,reject) => {
            let  pro =  new Promise((resolve,reject) => {
                fs.readFile("./bin/font/"+ filename,{ encoding: 'utf-8' } ,(err,data) => {
                    err ?  reject(err) : resolve(this.anaTts(str,data)) ;
                })
            })
            pro.then(data =>{
                resolve(data)
            },async () => {
                await this.downFile(filename)
                fs.readFile("./bin/font/"+ filename,{ encoding: 'utf-8' } ,(err,data) => {
                    resolve(this.anaTts(str,data))
                })
            })
        })
    }
    updateMovie(name :any ,maoyan_data :MaoYanData) : Promise<any> {
       return new Promise((resolve ,reject) => {
           Movie.find({ name : name}).exec((err,data : IMovie[]) => {
               if(data.length == 1 ){
                   Movie.findByIdAndUpdate(data[0]._id,maoyan_data).exec(function(){
                       resolve();
                   })
               }else{
                   resolve()
               }
           })
       })
    }
    saveBoxOffice(moc : MYOffice) : Promise<any>{
        return new Promise( (res,rej) => {
            BoxOffice.find({ id : moc.id ,box_date : moc.box_date }).exec(function(err,bofs){
                if(bofs.length == 0){
                    let ibo = new BoxOffice();
                    ibo.id = moc.id;
                    ibo.name = moc.name;
                    ibo.box_date = moc.box_date
                    ibo.film_realTime = moc.film_realTime
                    ibo.film_zb = moc.film_zb;
                    ibo.paipian_zb = moc.paipian_zb
                    ibo.attendance = moc.attendance
                    ibo.film_days = moc.film_days
                    ibo.save(function(err,data){
                        console.log("编号："+ moc.id +"-- 名称："+ moc.name +"        --------已入库")
                        res()
                    });
                }else{
                    console.log("编号："+ moc.id +"-- 名称："+ moc.name +"        --------已重复")
                    res()
                }
            })
        })
    }
    async saveBoxOffices(mocs : MYOffice[]){
        for(let i = 0; i < mocs.length; i++){
            await this.dealDate.wait_seconds(0.5)
            await this.saveBoxOffice(mocs[i])
        }
    }



    async test(){
        await this.start()        //抓取所有电影
    }
}










