const { Events } = require('discord.js');
module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;
        try {
            if (message.reference) return;
            if (message.content === ("napoli") && message.author.id === '295500038401163264') {
                await message.delete()
                message.channel.send({
                    content: 'Vaffammoc a mammt a te e tutt a razza toij l muert d scitestramuert quedda grandissim scassat d mammt bastard razz d merda fighj d buttan a murè strunz struscm a cappell tu e quedda buttn d nont e capit facc d stuedc mocc all muert d scutestramuert e tutt l muert ca tann fatt mocc a te mammt attand fratt sort ziant cugint nont e tutt quand m ste capisc mongolò cap d cazz d merd scurnacchiat a murè fighj d zoccl ten chiù corn tu ca queddà scassat e squasciat d mammt bucchinMa fa u cess rttfus bucchin kitemmuort pumaroncessua nguacchiato omm e merd lota pappalasagne pucchiacca rattus sicchio e lota putan strunzacchion chin e corn chin e merda uallera cessa fa nu chinott bucchin strunz ca mamt fa o cess latrin chin e corn munnez capera cessa latrina chella zom nacchennella muor tumor curnut pisciatur cazzon pizzon fa o cess latrin monnezz pagliacc vergogna mur va fai o schif latrin disct in gul fa a putan chin e merd fai o schif mur bastard a murì pigghjt e pall e mocc e muzzca com e pall e ris mannaghj a o cristo credetentone mannagg a uallera e a caldarell l muert e stramuert tuij fa o schif mamt fa e chinott cu nont e ziant e tutt a razza toij chiattillo ncessua nacchennella capera cessa latrina bastard va a pigghjt nu maruzz e pane in bocca mur strunz a murì pezz i cazz ti voghj abbottà Ma mur strunz bucchin kitemmuort muzzarell pumarol cap e cazz arrocchiapampene capera cessa latrina chella zompapereta e mammt chiattillo chiavica chiavt a leng ngul chin e corn kitestramuort kitebbiv facc e cazz fetosa facc e cazz nacchennella ncessua nguacchiato omm e merd lota pappalasagne pucchiacca rattus sicchio e lota soreta è na putan tieni chiù corna tu che ne panaro e maruzze uallera mammt a te e tutt a razza toij strunz trmon pisciatell bastard muor tumor curnut pisciature'
                })
            }
            if (message.content === ("firenze") && message.author.id === '295500038401163264') {
                await message.delete()
                message.channel.send({content: `
                                Poesia per Natale
                “Se ni’ mondo esistesse un po’ di bene
                e ognun si honsiderasse suo fratello
                ci sarebbe meno pensieri e meno pene
                e il mondo ne sarebbe assai più bello”
                P.P.
                (dice, Pierpaolo Pasolini? No, Pietro Pacciani!) ` })
            }
            if (message.content === ("/leave") && message.author.id === '295500038401163264') {
                await message.delete()
                message.channel.send('**Lorenzo ha quittato il server, tutti i suoi averi sono stati bruciati, il server esploderà tra:**');
                for (let i = 10; i > 0; i--) {
                    setTimeout(() => {
                        message.channel.send(i.toString());
                    }, (11 - i) * 1000);
                }
                setTimeout(() => {
                    message.channel.send(`Ci hai creduto anche? <:VC_KEKW:1331589010610589729>`);
                }, 11000);
            }
        } catch (error) {
            global.logger.error(error);
        }
    },
};
