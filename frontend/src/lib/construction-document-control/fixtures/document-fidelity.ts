import type { ConstructionDocumentControlReadModel } from '../types';

/** Deterministic acceptance fixture. Labels are presentation only; IDs carry identity. */
export const documentFidelityFixture: ConstructionDocumentControlReadModel = {
  projectId:'fixture-project', objectId:'fixture-object', projectName:'Fixture project', objectName:'Fixture object', currentPeriodId:'f2-current',
  valuation:{projectId:'fixture-project',objectId:'fixture-object',estimateRevisionId:'rev-base',currency:'UZS',throughPeriod:1,
    lines:[
      {lineId:'bl-original',sectionId:'section-1',lineType:'bl',description:'Beton ishlari',unit:'m³',baselineQuantity:100,baselineReferencePrice:100_000},
      {lineId:'rs-cement',parentLineId:'bl-original',sectionId:'section-1',lineType:'rs',description:'Sement',unit:'t',baselineQuantity:20,baselineReferencePrice:500_000},
      {lineId:'mat-steel',parentLineId:'bl-original',sectionId:'section-1',lineType:'mat',description:'Armatura',unit:'t',baselineQuantity:10,baselineReferencePrice:900_000},
      {lineId:'ob-pump',parentLineId:'bl-original',sectionId:'section-1',lineType:'ob',description:'Nasos',unit:'dona',baselineQuantity:2,baselineReferencePrice:2_000_000},
      {lineId:'finish',sectionId:'section-1',lineType:'bl',description:'Pardoz ishlari',unit:'m²',baselineQuantity:50,baselineReferencePrice:150_000},
      {lineId:'remove',sectionId:'section-1',lineType:'bl',description:'Bekor qilinadigan ish',unit:'m²',baselineQuantity:10,baselineReferencePrice:50_000},
      {lineId:'replacement-new',parentLineId:'bl-original',sectionId:'section-1',lineType:'mat',description:'Yangi sement',unit:'t',baselineQuantity:0,baselineReferencePrice:600_000},
      {lineId:'additional',sectionId:'section-2',lineType:'bl',description:'Drenaj ishlari',unit:'m',baselineQuantity:0,baselineReferencePrice:80_000}
    ],
    changes:[
      {changeId:'approved-replace-old',kind:'substitution',status:'approved',lineId:'rs-cement',revisionId:'rev-1',effectivePeriodIndex:1,quantityDelta:-2,reason:'approved replacement',evidenceIds:['change-approved']},
      {changeId:'approved-replace-new',kind:'substitution',status:'approved',lineId:'replacement-new',revisionId:'rev-1',effectivePeriodIndex:1,quantityDelta:2,valuationPrice:600_000,reason:'approved replacement',evidenceIds:['change-approved']},
      {changeId:'approved-additional',kind:'additional_work',status:'approved',lineId:'additional',revisionId:'rev-1',effectivePeriodIndex:1,quantityDelta:15,valuationPrice:80_000,reason:'approved additional work',evidenceIds:['change-approved']},
      {changeId:'increase',kind:'quantity_increase',status:'approved',lineId:'bl-original',revisionId:'rev-1',effectivePeriodIndex:1,quantityDelta:20,reason:'approved increase',evidenceIds:['change-approved']},
      {changeId:'decrease',kind:'quantity_decrease',status:'approved',lineId:'finish',revisionId:'rev-1',effectivePeriodIndex:1,quantityDelta:-5,reason:'approved decrease',evidenceIds:['change-approved']},
      {changeId:'remove',kind:'removal',status:'approved',lineId:'remove',revisionId:'rev-1',effectivePeriodIndex:1,quantityDelta:-10,reason:'approved removal',evidenceIds:['change-approved']},
      {changeId:'pending',kind:'resource_replacement',status:'pending',lineId:'mat-steel',revisionId:'rev-pending',effectivePeriodIndex:1,quantityDelta:-1,reason:'pending only',evidenceIds:[]},
      {changeId:'rejected',kind:'new_item',status:'rejected',lineId:'additional',revisionId:'rev-rejected',effectivePeriodIndex:1,quantityDelta:999,reason:'rejected only',evidenceIds:[]}
    ],
    periods:[
      {periodId:'f2-previous',label:'01.2026',revisionId:'f2-rev-previous',frozen:true,documentIds:['f2-previous-doc'],lines:[
        {lineId:'bl-original',quantity:40,certifiedAmount:4_000_000,f2ValuationPrice:100_000,actualProcurementPrice:110_000,referencePriceSourceId:'rev-base',actualPriceSourceId:'purchase-high'},
        {lineId:'rs-cement',quantity:4,certifiedAmount:2_000_000,f2ValuationPrice:500_000,actualProcurementPrice:550_000,referencePriceSourceId:'rev-base',actualPriceSourceId:'purchase-high'}]},
      {periodId:'f2-current',label:'02.2026',revisionId:'f2-rev-current',frozen:true,documentIds:['f2-current-doc'],lines:[
        {lineId:'bl-original',quantity:30,certifiedAmount:3_000_000,f2ValuationPrice:100_000,actualProcurementPrice:90_000,referencePriceSourceId:'rev-base',actualPriceSourceId:'purchase-low'},
        {lineId:'rs-cement',quantity:5,certifiedAmount:2_500_000,f2ValuationPrice:500_000,actualProcurementPrice:450_000,referencePriceSourceId:'rev-base',actualPriceSourceId:'purchase-low'},
        {lineId:'additional',quantity:5,certifiedAmount:400_000,f2ValuationPrice:80_000,actualProcurementPrice:75_000,referencePriceSourceId:'rev-1',actualPriceSourceId:'purchase-low'}]}
    ]
  },
  requirements:[],documents:[],revisions:[
    {revisionId:'rev-base',kind:'baseline',status:'certified',reason:'baseline',evidenceIds:[],immutable:true},
    {revisionId:'rev-1',kind:'change',status:'approved',reason:'approved changes',evidenceIds:['change-approved'],immutable:true},
    {revisionId:'f2-rev-previous',kind:'certification',status:'certified',reason:'frozen previous F2',evidenceIds:['f2-previous-doc'],immutable:true},
    {revisionId:'f2-rev-current',kind:'certification',status:'certified',reason:'frozen current F2',evidenceIds:['f2-current-doc'],immutable:true}
  ]
};
